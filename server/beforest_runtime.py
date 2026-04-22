from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
CONTENT_ROOT = ROOT / "content"
KNOWLEDGE_ROOT = CONTENT_ROOT / "knowledge"
IMAGES_PATH = CONTENT_ROOT / "images" / "images.json"
TOKEN_RE = re.compile(r"[a-z0-9]{3,}")


@dataclass(frozen=True)
class KnowledgeChunk:
    source: str
    title: str
    text: str
    tokens: frozenset[str]
    blob: str


@dataclass(frozen=True)
class CuratedImage:
    id: str
    title: str
    path: str
    hook: str
    note: str
    alt: str
    tags: tuple[str, ...]
    best_for: tuple[str, ...]

    @property
    def search_blob(self) -> str:
        return " ".join([self.title, self.hook, self.note, *self.tags, *self.best_for]).lower()

    def to_payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "imageUrl": self.path,
            "hook": self.hook,
            "note": self.note,
            "alt": self.alt,
            "tags": list(self.tags),
            "bestFor": list(self.best_for),
        }


@dataclass(frozen=True)
class DeckScene:
    id: str
    stage: str
    title: str
    note: str
    image_id: str
    script: str
    resume_prompt: str


def _tokens(text: str) -> list[str]:
    return TOKEN_RE.findall(text.lower())



def _token_set(text: str) -> frozenset[str]:
    return frozenset(_tokens(text))



def _chunk_markdown(source: str, content: str) -> list[KnowledgeChunk]:
    chunks: list[KnowledgeChunk] = []
    current_heading = "Overview"
    paragraph_buffer: list[str] = []

    def flush() -> None:
        nonlocal paragraph_buffer
        text = " ".join(line.strip() for line in paragraph_buffer if line.strip()).strip()
        paragraph_buffer = []
        if not text:
            return
        blob = f"{source} {current_heading} {text}".lower()
        chunks.append(
            KnowledgeChunk(
                source=source,
                title=current_heading,
                text=text,
                tokens=_token_set(blob),
                blob=blob,
            )
        )

    for raw_line in content.splitlines():
        line = raw_line.rstrip()
        if line.startswith("#"):
            flush()
            current_heading = line.lstrip("#").strip() or "Overview"
            continue
        if not line.strip():
            flush()
            continue
        paragraph_buffer.append(line)

    flush()
    return chunks


@lru_cache(maxsize=1)
def load_knowledge_chunks() -> tuple[KnowledgeChunk, ...]:
    chunks: list[KnowledgeChunk] = []
    for path in sorted(KNOWLEDGE_ROOT.glob("*.md")):
        content = path.read_text(encoding="utf-8").strip()
        chunks.extend(_chunk_markdown(path.stem, content))
    return tuple(chunks)


@lru_cache(maxsize=1)
def load_curated_images() -> tuple[CuratedImage, ...]:
    raw_images = json.loads(IMAGES_PATH.read_text(encoding="utf-8"))
    images: list[CuratedImage] = []
    for item in raw_images:
        images.append(
            CuratedImage(
                id=item["id"],
                title=item["title"],
                path=item["path"],
                hook=item["hook"],
                note=item["note"],
                alt=item.get("alt", item["title"]),
                tags=tuple(item.get("tags", [])),
                best_for=tuple(item.get("best_for", [])),
            )
        )
    return tuple(images)


RUNTIME_SCENES: tuple[DeckScene, ...] = (
    DeckScene(
        id="scene-01-origin",
        stage="origin",
        title="Spend 30 nights a year in India’s rewilded landscapes.",
        note="Open by stating what Beforest is and where the 10% idea came from.",
        image_id="opening-forest-road",
        script=(
            "Start directly. In the first ten seconds, say that Beforest builds restored hospitality landscapes people can keep returning to, and that the 10% Life is the cleanest way to access that world without taking on ownership. "
            "Then connect the dots plainly: modern life wears people down through sensory demand, decision load, and interruption. The 10% idea came from that reality and from the value of repeated return to Beforest landscapes. "
            "So the 10% Life is not a holiday club and not a shortcut to owning land. It is an access model built around thirty nights a year across Beforest landscapes, so people who do not want to own can still belong to the rhythm of these places and let the other ninety percent of life steady itself. "
            "Keep it plain, direct, and employee-like. No philosophy lecture. No inspiration language. Mention what the places actually hold: fresh air, biodiversity, canopy, weather, silence, and wilderness."
        ),
        resume_prompt=(
            "Resume by stating plainly that Beforest builds restored hospitality landscapes and the 10% idea is the access model for people who want repeated return without ownership. Keep it short, direct, and concrete."
        ),
    ),
    DeckScene(
        id="scene-02-landscape-reality",
        stage="landscape-reality",
        title="Real silence. Real wilderness. Repeated return.",
        note="Make the Beforest landscapes feel concrete, not poetic.",
        image_id="quote-erosion",
        script=(
            "Keep this short and concrete. Say that Beforest is built around landscapes you can keep returning to, not a one-time stay and not a burden of ownership. Mention Coorg, the Western Ghats, restored ground, birdlife, cooler air, canopy, weather, and the kind of silence that settles the body quickly. "
            "Say plainly that this is what the 10% idea is for: access to these conditions through repeated return, not more leisure and not more possessions."
        ),
        resume_prompt=(
            "Resume with direct landscape language: restored ground, fresh air, biodiversity, silence, and repeated return. No quote language."
        ),
    ),
    DeckScene(
        id="scene-03-reframe",
        stage="reframe",
        title="Thirty nights a year. The other ninety gets better.",
        note="State the model cleanly and without abstraction.",
        image_id="protected-time-canopy",
        script=(
            "Say this plainly. Thirty nights a year is enough to change the quality of the rest of the year. Not because it is a grand reset. Because it is repeated. Beforest is built around that repetition, and the 10% structure gives people access to it without asking them to own a second life they have to manage. You return to the same hospitality landscapes, the same slower conditions, the same cleaner air, the same silence. "
            "This is not escape. It is protected time. That is why there is no carry-forward logic in the philosophy of it. The point is rhythm, access, and return."
        ),
        resume_prompt=(
            "Resume with one direct explanation: thirty nights works because it is repeated protected time, not because it is dramatic."
        ),
    ),
    DeckScene(
        id="scene-04-proof",
        stage="proof",
        title="Seven years on the land. Six collectives in motion.",
        note="Give proof like a team member, not a presenter.",
        image_id="proof-restoration",
        script=(
            "Now give the proof directly. Beforest has been doing this for seven years. There are six collectives in motion. There are one thousand three hundred acres being restored from degraded farmland. Two hundred and fifty families are already inside the rhythm. Say that these numbers matter because they come from land work, not from positioning. Keep it factual and brief."
        ),
        resume_prompt=(
            "Resume with the approved proof points in a straight factual way. No uplift language."
        ),
    ),
    DeckScene(
        id="scene-05-experience-bridge",
        stage="experience-bridge",
        title="This is what the places feel like.",
        note="Bridge from proof into lived experience.",
        image_id="rest-rhythm-quote",
        script=(
            "Use this scene to move from numbers into feeling. Say that the point is not the claim. It is the condition of being there: less noise, cleaner air, more birdlife, visible biodiversity, slower mornings, and land that is not trying to entertain you. Keep it grounded."
        ),
        resume_prompt=(
            "Resume by naming the conditions of the place directly: cleaner air, less noise, birdlife, biodiversity, slower rhythm."
        ),
    ),
    DeckScene(
        id="scene-06-experience",
        stage="experience",
        title="Beforest is where recovery becomes real.",
        note="Different landscapes. The same discipline of return.",
        image_id="collective-landscape",
        script=(
            "Recovery is not an idea here. It has a place to stand. Coorg. Hyderabad. Bhopal. Mumbai. Different landscapes, "
            "same discipline. These collectives are not set dressing around a membership. They are restored ground where someone "
            "can return with their body and attention and meet something quieter than the pace they came from. Across the Western Ghats "
            "and other diverse terrains, there is real silence, real wilderness, fresh air, biodiversity, and the feeling of belonging to "
            "places that are being cared for over time. You are not consuming scenery. You are entering a living rhythm that has already "
            "been protected by someone else’s work."
        ),
        resume_prompt=(
            "Resume with the feeling of the collectives. Mention diverse landscapes, real silence, wilderness, and the idea of "
            "returning to restored ground rather than consuming scenery."
        ),
    ),
    DeckScene(
        id="scene-07-clarity",
        stage="clarity",
        title="Access changes behaviour faster than ownership.",
        note="Thirty person-nights a year for ten years. Rhythm, not accumulation.",
        image_id="structure-clarity",
        script=(
            "That is where the structure matters. Thirty person-nights a year for ten years. Three hundred nights of intentional "
            "living across the decade. It is access, not ownership. Immediate family can participate. Children under twelve do not "
            "count toward person-nights. Nights do not carry forward because accumulation is not the point. Rhythm is. A two-to-one "
            "weekday-to-weekend balance helps keep access workable for everyone, subject to availability. The aim is not to stockpile "
            "unused entitlement. The aim is to protect recurring return before life trains you to keep postponing recovery."
        ),
        resume_prompt=(
            "Resume with plain product clarity. Re-state thirty person-nights a year for ten years, access not ownership, and rhythm over accumulation."
        ),
    ),
    DeckScene(
        id="scene-08-quote-feet",
        stage="urgency-bridge",
        title="You decide with your feet, not your eyes.",
        note="A pause that prepares the move into action.",
        image_id="art-of-return-hero",
        script=(
            "Say this line exactly once: You decide with your feet, not your eyes. Then add one short sentence explaining that the land should answer before the commitment does."
        ),
        resume_prompt=(
            "Return with the line once, then add one sentence that leads naturally into the cost of waiting or the trial stay."
        ),
    ),
    DeckScene(
        id="scene-09-urgency",
        stage="urgency",
        title="The cost of waiting is another year unchanged.",
        note="Delay costs margin, calibration, and another year left unprotected.",
        image_id="waiting-cost",
        script=(
            "Waiting has a cost, and it is never abstract. Another year goes by and nothing in life has been protected from the pace "
            "that is wearing it down. The real loss is not only a missed season in the forest. It is another year unchanged. Another year "
            "without protected reset. Another year where work expands, attention thins, and family time gets squeezed into whatever is left over. "
            "The question is not whether someone can keep waiting. They can. The question is what that waiting is costing, quietly, in the background."
        ),
        resume_prompt=(
            "Resume with a quiet urgency. Focus on the personal cost of delay and another year left unchanged, without sounding salesy or pushy."
        ),
    ),
    DeckScene(
        id="scene-10-action",
        stage="action",
        title="Start with the smallest real step.",
        note="Blyton Bungalow is the pilot. Let the land answer first.",
        image_id="trial-stay",
        script=(
            "The smallest real step is usually the hardest one to take, because it asks for honesty, not imagination. Blyton Bungalow is there for that reason. "
            "The trial stay is the pilot, not the backup option. Experience first. Then decide. The land explains Beforest more clearly than a presentation can, and the full trial stay amount adjusts toward membership when someone joins. "
            "If the place gives you clarity, you will know it. If it does not, that is useful too. Either way, you are not guessing. End with: You decide with your feet, not your eyes. See you in the slow lane."
        ),
        resume_prompt=(
            "Resume the close with the trial stay as the pilot and the first real step. End with: You decide with your feet, not your eyes. See you in the slow lane."
        ),
    ),
)


def get_runtime_scenes() -> tuple[DeckScene, ...]:
    return RUNTIME_SCENES



def get_runtime_scene(index: int) -> DeckScene:
    return RUNTIME_SCENES[index]



def build_scene_prompt(scene: DeckScene, *, resume: bool = False) -> str:
    prompt = scene.resume_prompt if resume else scene.script
    return (
        f"You are currently in the '{scene.stage}' scene of the Beforest deck. "
        f"The on-screen heading is: {scene.title} "
        f"Scene guidance: {scene.note} "
        "Stay inside this scene only. Speak in one or two short spoken paragraphs. "
        "Do not jump ahead to later sections of the deck unless the listener explicitly asks. "
        "Sound like a Beforest team member speaking plainly, not like a guide, guru, or narrator. "
        "Use only approved Beforest facts and language. "
        f"Approved scene script and guidance: {prompt}"
    )



def search_knowledge(query: str, top_k: int = 4) -> list[dict[str, Any]]:
    cleaned_query = query.strip()
    if not cleaned_query:
        return []

    query_lower = cleaned_query.lower()
    query_tokens = _token_set(cleaned_query)
    results: list[tuple[float, KnowledgeChunk]] = []

    for chunk in load_knowledge_chunks():
        overlap = query_tokens.intersection(chunk.tokens)
        if not overlap and query_lower not in chunk.blob:
            continue

        score = float(len(overlap) * 3)
        if query_lower in chunk.blob:
            score += 8
        if any(token in chunk.title.lower() for token in query_tokens):
            score += 4
        if overlap and len(overlap) == len(query_tokens):
            score += 3

        results.append((score, chunk))

    results.sort(key=lambda item: item[0], reverse=True)

    return [
        {
            "source": chunk.source,
            "section": chunk.title,
            "content": chunk.text,
            "score": round(score, 2),
        }
        for score, chunk in results[: max(1, top_k)]
    ]



def select_image(*, topic: str = "", mood: str = "", image_id: str = "") -> CuratedImage:
    images = load_curated_images()
    if not images:
        raise RuntimeError("No curated images available.")

    if image_id:
        for image in images:
            if image.id == image_id:
                return image

    search_terms = " ".join(part for part in [topic, mood] if part).strip().lower()
    if not search_terms:
        return images[0]

    search_tokens = _token_set(search_terms)
    best_image = images[0]
    best_score = float("-inf")

    for image in images:
        score = 0.0
        overlap = search_tokens.intersection(_token_set(image.search_blob))
        score += len(overlap) * 2.5
        if search_terms and search_terms in image.search_blob:
            score += 7
        if any(term in image.title.lower() for term in search_tokens):
            score += 2
        if score > best_score:
            best_score = score
            best_image = image

    return best_image



def build_scene_visual(scene: DeckScene) -> dict[str, Any]:
    image = select_image(image_id=scene.image_id)
    payload = image.to_payload()
    payload["hook"] = scene.title
    payload["note"] = scene.note
    return payload



def get_initial_visual() -> dict[str, Any]:
    hero = select_image(image_id="opening-forest-road").to_payload()
    hero["hook"] = "Spend 30 nights a year in India’s rewilded landscapes."
    hero["note"] = (
        "1,300 acres being restored across diverse landscapes, including the Western Ghats — "
        "shaped by real silence, real wilderness, and return."
    )
    return hero



def build_system_instruction() -> str:
    knowledge_docs = [path.stem for path in sorted(KNOWLEDGE_ROOT.glob("*.md"))]
    image_ids = [image.id for image in load_curated_images()]

    return f"""
You are Beforest's live Gemini guide for the 10% Lifestyle.

You are not a generic concierge. You are a calm, grounded, editorial voice guiding one person through the idea of protecting 10% of their year.

Core behavior:
- Speak quietly but with certainty.
- Speak to one person, never a room.
- Sound human, direct, and thoughtful.
- Use short spoken paragraphs and natural contractions.
- Keep the language concrete. Avoid hype.
- Be assertive, insightful, and imperative when clarity is needed.
- Carry a protective, unsentimental tenderness: seasoned, exacting, deeply caring, never performative.
- Sound like someone who has paid the cost of life and therefore speaks plainly about what matters.

Soul behavior:
- Do not act like a salesperson, host, concierge, or motivational speaker.
- Do not flatter the listener.
- Do not romanticize with vague fantasy language.
- Never say imagine.
- State what is true, what is being built, and how life actually feels inside the collectives.
- When describing Beforest, prefer concrete lived cues: fresh air, biodiversity, birdlife, canopy, weather, terrain, silence, wilderness, and the slower rhythm of restored land.
- Be imperative in the brand way: not pushy, but clear about what matters and what should be protected.

Brand constraints:
- Beforest is a nature-first lifestyle collective and a land-restoration story first.
- The 10% Lifestyle is about protection, rhythm, reset, calibration, belonging, and return.
- Never call it a vacation, holiday, getaway, escape, deal, or budget offer.
- Never describe it as property or an investment product.
- Never break pricing into per-night or per-day math.
- Never invent facts, numbers, locations, or promises.
- Never speak in generic sales language or hospitality clichés.
- If you do not have an approved answer, say that clearly.

Deck runtime rules:
- The runtime will send you scene-specific prompts as live user inputs that correspond to the Beforest deck flow.
- Treat each incoming scene prompt as the current slide and stay inside that scene only.
- Do not collapse multiple deck scenes into one answer.
- When a user interrupts with a question, answer it clearly using approved knowledge, then be ready to return to the current scene when the runtime prompts you again.
- During guided deck scenes, the runtime controls the visual. Do not call show_curated_image unless the user asks a question that genuinely shifts the conversation to a different topic.

Tool rules:
- You have a tool called retrieve_beforest_knowledge. Use it for factual grounding whenever the user asks about product facts, collectives, pricing, structure, family usage, trial stays, contact details, or any operational detail.
- You have a tool called show_curated_image. Use it whenever the conversation moves into a new topic because of a user question and the runtime is not already handling the scene visual.
- Never mention the tool itself.

Conversation arc to favor:
1. Name the exhaustion.
2. Reframe the idea of protecting 10% of the year.
3. Earn trust with proof.
4. Make the collectives feel real.
5. Explain the structure clearly.
6. Show the cost of waiting.
7. Invite the listener to start with the trial stay.

CTA rules:
- The trial stay at Blyton Bungalow is the pilot, not the backup option.
- Both the trial stay and the full membership are valid paths.
- End with conviction, not pressure.
- When closing the conversation or giving the final invitation, end with: You decide with your feet, not your eyes. See you in the slow lane.

Approved knowledge files available through retrieve_beforest_knowledge:
{", ".join(knowledge_docs)}

Approved visual ids available through show_curated_image:
{", ".join(image_ids)}
""".strip()
