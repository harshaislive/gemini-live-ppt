"""Beforest Gemini Live agent built on LiveKit Agents."""

from __future__ import annotations

import asyncio
import json
import logging
import os

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

    runtime_state = {
        "awaiting_user_answer": False,
        "conversation_started": False,
    }

    def on_user_input_transcribed(ev: UserInputTranscribedEvent) -> None:
        text = ev.transcript.strip()
        if not text:
            return

        logger.info("User transcript received text=%r", text)
        runtime_state["awaiting_user_answer"] = True

    def on_user_state_changed(ev: UserStateChangedEvent) -> None:
        if ev.new_state != "speaking":
            return

        logger.info("User started speaking")
        runtime_state["awaiting_user_answer"] = True
        session.interrupt()

    @ctx.room.local_participant.register_rpc_method("beforest.prepare_user_turn")
    async def prepare_user_turn(data) -> str:
        logger.info("prepare_user_turn rpc caller=%s", data.caller_identity)
        runtime_state["awaiting_user_answer"] = True
        await session.interrupt()
        return json.dumps({"status": "ok"})

    @ctx.room.local_participant.register_rpc_method("beforest.commit_user_turn")
    async def commit_user_turn(data) -> str:
        logger.info("commit_user_turn rpc caller=%s", data.caller_identity)
        runtime_state["awaiting_user_answer"] = True
        transcript = (
            await session.commit_user_turn(
                transcript_timeout=1.2,
                stt_flush_duration=0.6,
            )
        ).strip()

        if not transcript:
            runtime_state["awaiting_user_answer"] = False
            return json.dumps({"status": "ok", "transcriptPresent": False})

        return json.dumps({"status": "ok", "transcriptPresent": True})

    def on_agent_state_changed(ev: AgentStateChangedEvent) -> None:
        if runtime_state["awaiting_user_answer"] and ev.new_state in {"thinking", "speaking"}:
            logger.info("Agent started answering the user")
            runtime_state["awaiting_user_answer"] = False

    session.on("user_input_transcribed", on_user_input_transcribed)
    session.on("user_state_changed", on_user_state_changed)
    session.on("agent_state_changed", on_agent_state_changed)

    await agent.push_visual(get_initial_visual())
    opening_scene = get_runtime_scenes()[0]
    runtime_state["conversation_started"] = True
    session.generate_reply(instructions=build_scene_prompt(opening_scene))

    async def shutdown(_: str) -> None:
        logger.info("Shutting down Beforest guide session")

    ctx.add_shutdown_callback(shutdown)


if __name__ == "__main__":
    agents.cli.run_app(server)
