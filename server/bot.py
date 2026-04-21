"""Beforest Gemini Live bot built on the Pipecat starter architecture."""

from __future__ import annotations

import asyncio
import os
from typing import Any

from dotenv import load_dotenv
from google.genai.types import ThinkingConfig
from loguru import logger
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import InputTextRawFrame, LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    UserTurnStoppedMessage,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams

from beforest_runtime import (
    build_scene_prompt,
    build_scene_visual,
    build_system_instruction,
    get_initial_visual,
    get_runtime_scenes,
    search_knowledge,
    select_image,
)

load_dotenv(override=True)

MODEL = os.getenv("GEMINI_LIVE_MODEL", "models/gemini-2.5-flash-native-audio-preview-12-2025")
VOICE_ID = os.getenv("GOOGLE_VOICE_ID", "Charon")
LANGUAGE_CODE = os.getenv("GOOGLE_LANGUAGE_CODE", "en-US")


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    logger.info("Starting Beforest Gemini Live bot")

    retrieve_knowledge_function = FunctionSchema(
        name="retrieve_beforest_knowledge",
        description=(
            "Search approved Beforest markdown knowledge for product facts, collectives, "
            "pricing framing, structure details, trial-stay information, and brand constraints."
        ),
        properties={
            "query": {
                "type": "string",
                "description": "The exact knowledge question to search for.",
            },
            "top_k": {
                "type": "integer",
                "description": "How many matching excerpts to return. Use 2 to 4.",
            },
        },
        required=["query"],
    )
    show_curated_image_function = FunctionSchema(
        name="show_curated_image",
        description=(
            "Select an approved Beforest image for the current topic and update the frontend's "
            "editorial visual state. Use it whenever the conversation moves to a new scene, "
            "place, proof point, or CTA."
        ),
        properties={
            "topic": {
                "type": "string",
                "description": "The topic or scene you want the image to support.",
            },
            "mood": {
                "type": "string",
                "description": "Optional emotional tone such as calm, proof, urgency, or return.",
            },
            "image_id": {
                "type": "string",
                "description": "Optional exact visual id when you already know the best image.",
            },
        },
        required=["topic"],
    )

    tools = ToolsSchema(
        standard_tools=[retrieve_knowledge_function, show_curated_image_function]
    )

    llm = GeminiLiveLLMService(
        api_key=os.getenv("GOOGLE_API_KEY"),
        tools=tools,
        settings=GeminiLiveLLMService.Settings(
            model=MODEL,
            voice=VOICE_ID,
            language=LANGUAGE_CODE,
            system_instruction=build_system_instruction(),
            thinking=ThinkingConfig(thinking_budget=0),
        ),
    )

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context)

    pipeline = Pipeline(
        [
            transport.input(),
            user_aggregator,
            llm,
            transport.output(),
            assistant_aggregator,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
    )

    scenes = get_runtime_scenes()
    runtime_state: dict[str, Any] = {
        "scene_index": -1,
        "turn_kind": None,
        "awaiting_user_answer": False,
        "resume_scene_index": None,
        "connected": False,
        "presentation_started": False,
    }
    pending_scene_task: asyncio.Task | None = None

    async def send_visual_update(visual: dict[str, Any]) -> None:
        await task.rtvi.send_server_message(
            {
                "type": "beforest.visual",
                "visual": visual,
            }
        )

    async def speak_scene_via_realtime_input(index: int, *, resume: bool = False) -> None:
        if index < 0 or index >= len(scenes) or not runtime_state["connected"]:
            return

        scene = scenes[index]
        scene_prompt = build_scene_prompt(scene, resume=resume)

        logger.info(
            f"Triggering scene {index + 1}/{len(scenes)} via native realtime text "
            f"(scene={scene.id}, resume={resume})"
        )
        runtime_state["scene_index"] = index
        runtime_state["turn_kind"] = "scene"
        runtime_state["awaiting_user_answer"] = False
        runtime_state["resume_scene_index"] = None

        await send_visual_update(build_scene_visual(scene))
        await task.queue_frames([InputTextRawFrame(text=scene_prompt)])

    async def start_presentation(delay: float = 1.1) -> None:
        await asyncio.sleep(delay)
        if not runtime_state["connected"] or runtime_state["presentation_started"]:
            return

        first_scene = scenes[0]
        logger.info("Starting presentation through initial context + LLMRunFrame")
        runtime_state["presentation_started"] = True
        runtime_state["scene_index"] = 0
        runtime_state["turn_kind"] = "scene"
        runtime_state["awaiting_user_answer"] = False
        runtime_state["resume_scene_index"] = None

        await send_visual_update(build_scene_visual(first_scene))
        context.add_message({"role": "user", "content": build_scene_prompt(first_scene)})
        await task.queue_frames([LLMRunFrame()])

    async def queue_scene_later(index: int, *, resume: bool = False, delay: float = 2.2) -> None:
        await asyncio.sleep(delay)
        await speak_scene_via_realtime_input(index, resume=resume)

    def schedule_scene(index: int, *, resume: bool = False, delay: float = 2.2) -> None:
        nonlocal pending_scene_task
        if pending_scene_task and not pending_scene_task.done():
            pending_scene_task.cancel()
        pending_scene_task = asyncio.create_task(queue_scene_later(index, resume=resume, delay=delay))

    async def retrieve_beforest_knowledge(params: FunctionCallParams):
        query = str(params.arguments.get("query", "")).strip()
        top_k_raw = params.arguments.get("top_k", 3)
        try:
            top_k = max(1, min(4, int(top_k_raw)))
        except (TypeError, ValueError):
            top_k = 3

        matches = search_knowledge(query, top_k=top_k)
        await params.result_callback(
            {
                "query": query,
                "matches": matches,
                "guidance": (
                    "Use only these approved excerpts and the current conversation context. "
                    "If the answer still is not grounded, say you do not have an approved answer yet."
                ),
            }
        )

    async def show_curated_image(params: FunctionCallParams):
        topic = str(params.arguments.get("topic", "")).strip()
        mood = str(params.arguments.get("mood", "")).strip()
        image_id = str(params.arguments.get("image_id", "")).strip()

        image = select_image(topic=topic, mood=mood, image_id=image_id)
        payload = image.to_payload()
        await send_visual_update(payload)
        await params.result_callback(
            {
                "selected": payload,
                "guidance": (
                    "The frontend has been updated with this visual. Continue speaking naturally "
                    "without announcing the tool call."
                ),
            }
        )

    llm.register_function("retrieve_beforest_knowledge", retrieve_beforest_knowledge)
    llm.register_function("show_curated_image", show_curated_image)

    @user_aggregator.event_handler("on_user_turn_started")
    async def on_user_turn_started(aggregator, strategy):
        if not runtime_state["connected"]:
            return
        logger.info(
            f"User turn started (strategy={getattr(strategy, '__class__', type(strategy)).__name__}, "
            f"scene_index={runtime_state['scene_index']}, turn_kind={runtime_state['turn_kind']})"
        )
        if pending_scene_task and not pending_scene_task.done():
            pending_scene_task.cancel()

    @user_aggregator.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message: UserTurnStoppedMessage):
        text = (message.content or "").strip()
        logger.info(
            f"User turn stopped (strategy={getattr(strategy, '__class__', type(strategy)).__name__}, "
            f"text={text!r}, scene_index={runtime_state['scene_index']}, turn_kind={runtime_state['turn_kind']})"
        )
        if not text:
            return

        runtime_state["awaiting_user_answer"] = True
        if runtime_state["scene_index"] >= 0:
            runtime_state["resume_scene_index"] = runtime_state["scene_index"]

    @assistant_aggregator.event_handler("on_assistant_turn_started")
    async def on_assistant_turn_started(aggregator):
        logger.info(
            f"Assistant turn started (awaiting_user_answer={runtime_state['awaiting_user_answer']}, "
            f"scene_index={runtime_state['scene_index']})"
        )
        if runtime_state["awaiting_user_answer"]:
            runtime_state["turn_kind"] = "answer"
            runtime_state["awaiting_user_answer"] = False

    @assistant_aggregator.event_handler("on_assistant_turn_stopped")
    async def on_assistant_turn_stopped(aggregator, message):
        turn_kind = runtime_state.get("turn_kind")
        interrupted = getattr(message, "interrupted", False)
        logger.info(
            f"Assistant turn stopped (turn_kind={turn_kind}, interrupted={interrupted}, "
            f"scene_index={runtime_state['scene_index']})"
        )
        runtime_state["turn_kind"] = None

        if interrupted:
            return

        if turn_kind == "answer":
            resume_scene_index = runtime_state.get("resume_scene_index")
            if resume_scene_index is not None:
                schedule_scene(int(resume_scene_index), resume=True, delay=1.35)
            return

        if turn_kind != "scene":
            return

        next_index = int(runtime_state["scene_index"]) + 1
        if next_index < len(scenes):
            schedule_scene(next_index)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, participant):
        logger.info("Client connected")
        runtime_state["connected"] = True
        runtime_state["presentation_started"] = False
        await send_visual_update(get_initial_visual())
        asyncio.create_task(start_presentation())

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        runtime_state["connected"] = False
        if pending_scene_task and not pending_scene_task.done():
            pending_scene_task.cancel()
        await task.cancel()

    runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)
    await runner.run(task)


async def bot(runner_args: RunnerArguments):
    if os.environ.get("ENV") != "local":
        from pipecat.audio.filters.krisp_viva_filter import KrispVivaFilter

        krisp_filter = KrispVivaFilter()
    else:
        krisp_filter = None

    transport_params = {
        "daily": lambda: DailyParams(
            audio_in_enabled=True,
            audio_in_filter=krisp_filter,
            audio_out_enabled=True,
            audio_out_sample_rate=24000,
            video_in_enabled=False,
        ),
        "webrtc": lambda: TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_out_sample_rate=24000,
            video_in_enabled=False,
        ),
    }

    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
