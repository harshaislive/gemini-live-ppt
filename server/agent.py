"""Beforest Gemini Live agent built on LiveKit Agents."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AgentStateChangedEvent,
    UserInputTranscribedEvent,
    UserStateChangedEvent,
    function_tool,
    room_io,
)
from livekit.plugins import ai_coustics, google, silero

from beforest_runtime import (
    build_scene_prompt,
    build_scene_visual,
    build_system_instruction,
    get_initial_visual,
    get_runtime_scenes,
    search_knowledge,
    select_image,
)

load_dotenv(".env")

logger = logging.getLogger("beforest.agent")

MODEL = os.getenv("GEMINI_LIVE_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025")
VOICE_ID = os.getenv("GOOGLE_VOICE_ID", "Puck")
AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "beforest-guide")
FRONTEND_IDENTITY = os.getenv("LIVEKIT_FRONTEND_IDENTITY", "frontend")


def get_first_name(full_name: str) -> str:
    cleaned = full_name.strip()
    if not cleaned:
        return ""
    return cleaned.split()[0]


class BeforestGuide(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=build_system_instruction())
        self.room = None

    async def push_visual(self, payload: dict[str, object]) -> None:
        if self.room is None:
            raise RuntimeError("Room is not attached to the agent yet.")

        rpc_payload = json.dumps(payload)

        for attempt in range(2):
            try:
                await self.room.local_participant.perform_rpc(
                    destination_identity=FRONTEND_IDENTITY,
                    method="show_image",
                    payload=rpc_payload,
                    response_timeout=5,
                )
                return
            except Exception:
                if attempt == 1:
                    raise
                await asyncio.sleep(0.6)

    @function_tool
    async def retrieve_beforest_knowledge(
        self,
        query: str,
        top_k: int = 3,
    ) -> str:
        """Search approved Beforest knowledge for product facts, places, structure, and trial-stay details."""

        matches = search_knowledge(query, top_k=max(1, min(4, top_k)))
        if not matches:
            return "No approved excerpt matched that question. Say you do not have an approved answer yet."

        parts = []
        for match in matches:
            parts.append(
                f"Source: {match['source']} | Section: {match['section']}\n{match['content']}"
            )

        return "\n\n".join(parts)

    @function_tool
    async def show_curated_image(
        self,
        topic: str,
        mood: str = "",
        image_id: str = "",
    ) -> str:
        """Show an approved Beforest image for the current topic and update the frontend visual state."""

        image = select_image(topic=topic, mood=mood, image_id=image_id)
        payload = image.to_payload()
        await self.push_visual(payload)
        return "The frontend visual has been updated. Continue naturally without mentioning the tool."


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def beforest_live(ctx: agents.JobContext):
    scenes = get_runtime_scenes()
    agent = BeforestGuide()
    agent.room = ctx.room
    session = AgentSession(
        llm=google.realtime.RealtimeModel(
            model=MODEL,
            voice=VOICE_ID,
        ),
        vad=silero.VAD.load(),
    )

    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=ai_coustics.audio_enhancement(
                    model=ai_coustics.EnhancerModel.QUAIL_VF_L,
                ),
            ),
        ),
    )

    listener_name = ""
    try:
        participant = await ctx.wait_for_participant(identity=FRONTEND_IDENTITY)
        listener_name = get_first_name(participant.name or "")
    except Exception:
        listener_name = ""

    if listener_name:
        await agent.update_instructions(
            build_system_instruction()
            + f"\n\nListener note:\n- The current listener's first name is {listener_name}."
            + " Use their name sparingly and naturally when it helps warmth or clarity."
            + " Do not force it into every answer, every opening, or every close."
        )

    runtime_state: dict[str, Any] = {
        "scene_index": -1,
        "turn_kind": None,
        "awaiting_user_answer": False,
        "resume_scene_index": None,
        "presentation_started": False,
    }
    pending_scene_task: asyncio.Task | None = None
    current_scene_handle = None

    def mark_user_turn_pending() -> None:
        runtime_state["awaiting_user_answer"] = True
        if runtime_state["scene_index"] >= 0:
            runtime_state["resume_scene_index"] = runtime_state["scene_index"]

    def cancel_pending_scene() -> None:
        nonlocal pending_scene_task
        if pending_scene_task and not pending_scene_task.done():
            logger.info("Cancelling pending scene task")
            pending_scene_task.cancel()
        pending_scene_task = None

    async def speak_scene(index: int, *, resume: bool = False) -> None:
        nonlocal current_scene_handle

        if index < 0 or index >= len(scenes):
            return

        scene = scenes[index]
        runtime_state["scene_index"] = index
        runtime_state["turn_kind"] = "scene"
        runtime_state["awaiting_user_answer"] = False
        runtime_state["resume_scene_index"] = None

        logger.info(
            "Triggering scene %s/%s scene=%s resume=%s",
            index + 1,
            len(scenes),
            scene.id,
            resume,
        )

        await agent.push_visual(build_scene_visual(scene))
        handle = session.generate_reply(instructions=build_scene_prompt(scene, resume=resume))
        current_scene_handle = handle

        def on_scene_done(done_handle) -> None:
            nonlocal current_scene_handle
            if current_scene_handle is done_handle:
                current_scene_handle = None

            if done_handle.interrupted:
                return

            if runtime_state.get("turn_kind") != "scene":
                return

            runtime_state["turn_kind"] = None
            next_index = index + 1
            if next_index < len(scenes):
                logger.info("Scheduling next scene index=%s", next_index)
                schedule_scene(next_index)

        handle.add_done_callback(on_scene_done)

    async def queue_scene_later(index: int, *, resume: bool = False, delay: float = 2.2) -> None:
        await asyncio.sleep(delay)
        await speak_scene(index, resume=resume)

    def schedule_scene(index: int, *, resume: bool = False, delay: float = 2.2) -> None:
        nonlocal pending_scene_task
        cancel_pending_scene()
        logger.info("Queueing scene index=%s resume=%s delay=%.2f", index, resume, delay)
        pending_scene_task = asyncio.create_task(queue_scene_later(index, resume=resume, delay=delay))

    def on_user_input_transcribed(ev: UserInputTranscribedEvent) -> None:
        text = ev.transcript.strip()
        if not text:
            return

        logger.info(
            "User transcript received scene_index=%s text=%r",
            runtime_state["scene_index"],
            text,
        )

        cancel_pending_scene()
        mark_user_turn_pending()

    def on_user_state_changed(ev: UserStateChangedEvent) -> None:
        if ev.new_state != "speaking":
            return

        logger.info(
            "User started speaking scene_index=%s turn_kind=%s",
            runtime_state["scene_index"],
            runtime_state["turn_kind"],
        )

        cancel_pending_scene()
        mark_user_turn_pending()

        if runtime_state.get("turn_kind") == "scene":
            session.interrupt()

    @ctx.room.local_participant.register_rpc_method("beforest.prepare_user_turn")
    async def prepare_user_turn(data) -> str:
        logger.info(
            "prepare_user_turn rpc scene_index=%s turn_kind=%s caller=%s",
            runtime_state["scene_index"],
            runtime_state["turn_kind"],
            data.caller_identity,
        )
        cancel_pending_scene()
        mark_user_turn_pending()
        if runtime_state.get("turn_kind") == "scene":
            await session.interrupt()
        return json.dumps({"status": "ok"})

    @ctx.room.local_participant.register_rpc_method("beforest.commit_user_turn")
    async def commit_user_turn(data) -> str:
        logger.info(
            "commit_user_turn rpc scene_index=%s turn_kind=%s caller=%s",
            runtime_state["scene_index"],
            runtime_state["turn_kind"],
            data.caller_identity,
        )
        mark_user_turn_pending()
        transcript = (await session.commit_user_turn()).strip()

        if not transcript:
            logger.info(
                "No user transcript captured; resuming scene_index=%s",
                runtime_state.get("resume_scene_index"),
            )
            runtime_state["awaiting_user_answer"] = False
            runtime_state["turn_kind"] = None
            resume_scene_index = runtime_state.get("resume_scene_index")
            if resume_scene_index is not None:
                schedule_scene(int(resume_scene_index), resume=True, delay=0.6)
            return json.dumps({"status": "ok", "transcriptPresent": False})

        return json.dumps({"status": "ok", "transcriptPresent": True})

    def on_agent_state_changed(ev: AgentStateChangedEvent) -> None:
        if runtime_state["awaiting_user_answer"] and ev.new_state in {"thinking", "speaking"}:
            logger.info("Switching turn kind to answer")
            runtime_state["turn_kind"] = "answer"
            runtime_state["awaiting_user_answer"] = False

        if (
            runtime_state.get("turn_kind") == "answer"
            and ev.old_state == "speaking"
            and ev.new_state in {"idle", "listening"}
        ):
            runtime_state["turn_kind"] = None
            resume_scene_index = runtime_state.get("resume_scene_index")
            if resume_scene_index is not None:
                logger.info("Resuming scene index=%s after user answer", resume_scene_index)
                schedule_scene(int(resume_scene_index), resume=True, delay=1.35)

    session.on("user_input_transcribed", on_user_input_transcribed)
    session.on("user_state_changed", on_user_state_changed)
    session.on("agent_state_changed", on_agent_state_changed)

    await agent.push_visual(get_initial_visual())
    runtime_state["presentation_started"] = True
    schedule_scene(0, delay=1.1)

    async def shutdown(_: str) -> None:
        cancel_pending_scene()

    ctx.add_shutdown_callback(shutdown)


if __name__ == "__main__":
    agents.cli.run_app(server)
