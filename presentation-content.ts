export interface PresentationSlide {
  id: string;
  title: string;
  note: string;
  script: string;
  imageUrl: string;
  ctaLabel?: string;
  ctaHref?: string;
  kind?: 'scene' | 'quote' | 'cta' | 'derived';
}

export const presentationTitle = 'The 10% Life';

export const presentationSlides: PresentationSlide[] = [
  {
    id: 'slide-01',
    title: 'Full calendars do not make full lives.',
    note:
      'Name the quiet erosion of overcapacity. Restoration is maintenance, not a luxury.',
    script:
      'Full calendars do not make full lives. They can look like momentum from the outside and still be a slow kind of erosion on the inside. Most ambitious lives do not break from lack of drive. They break when there is nowhere protected for recovery, so the body keeps paying for a pace the mind has already normalized. You keep saying yes, keep shipping, keep showing up, and somewhere in that rhythm the basic human requirement for restoration gets treated like a luxury. It is not. It is maintenance. It is what keeps judgment clean, attention sharp, and people from becoming efficient versions of themselves. The problem is not output. The problem is that without a protected rhythm, recovery gets absorbed into whatever time is left over, and what is left over is usually nothing. Then rest becomes reactive. Sleep gets patched together. Weekends become catch-up. Even good work starts to feel expensive. That is how a strong life gets brittle. The question is not how to escape the grind. It is what part of your year gets protected well enough that the grind stops taking everything.',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PBR_0209.jpg',
    kind: 'scene',
  },
  {
    id: 'slide-02',
    title: 'You can get very good at a life that is quietly hurting you.',
    note:
      'A quiet quote scene that sharpens the emotional framing before the reframe.',
    script:
      'You can get very good at a life that is quietly hurting you.',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PBR_0209.jpg',
    kind: 'quote',
  },
  {
    id: 'slide-03',
    title: 'You do not need escape. You need protected time.',
    note:
      'Reframe the promise. Thirty nights a year is a practice of return, not a disappearance from life.',
    script:
      'If the place cannot hold your trust, the promise does not matter. Protected time only works when the ground beneath it is steady. Thirty nights a year is not a fantasy number. It is enough to interrupt the long drift of fatigue without asking you to step out of your life and start a new one somewhere else. You are not trying to disappear for three months. You are trying to build a rhythm that keeps returning you to yourself. That is why this is framed as a practice, not a pause. The point is not more leisure. The point is repeated contact with quiet, with sleep, with a different pace of attention. Enough time in the wilderness and your body starts remembering what it has been missing. Exhaustion is rarely solved by a single grand reset. It softens when recovery becomes regular. When the year is no longer one long stretch of output with a few apologetic breaks in between. Then the other ninety percent changes too. You arrive less frayed, you sleep more deeply, you make cleaner decisions. But none of that holds if the place itself is unreliable. Rhythm depends on trust. If you are going to protect time, the land has to deserve it.',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PBR_0814.jpg',
    kind: 'scene',
  },
  {
    id: 'slide-04',
    title: 'Trust should be built on land, not language.',
    note:
      'Move into evidence. Seven years, six collectives, restored land, and real families inside the rhythm.',
    script:
      'Seven years is a long time to build something quietly. Long enough for the work to stop being a claim and start becoming evidence. Six collectives. Thirteen hundred acres restored from degraded farmland. Two hundred and fifty families already inside the rhythm. Those numbers matter because they are not marketing language. They are the footprint of stewardship. Beforest has been on the land long enough to learn what survives, what returns, and what changes when care is sustained instead of performed. That is what trust looks like here. Not a polished promise. Not a clever story. Substance before story means the land has already done the convincing, and the community has already made the choice. You are not gambling on a concept. You are stepping into something with years behind it, and real people already holding it in place. Once credibility is established, the question is no longer whether this exists. The question is what it feels like to belong to it.',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PSX_20211216_190054.webp',
    kind: 'scene',
  },
  {
    id: 'slide-05',
    title: 'Rest is not a reward. It is a rhythm worth protecting.',
    note:
      'A pause slide. Short and declarative, with no need to over-explain.',
    script:
      'Rest is not a reward. It is a rhythm worth protecting.',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/PSX_20211216_190054.webp',
    kind: 'quote',
  },
  {
    id: 'slide-06',
    title: 'Beforest is where recovery becomes real.',
    note:
      'Make the life tangible. Different landscapes, same discipline of return and belonging.',
    script:
      'Recovery is not an idea here. It has a place to stand. Coorg. Hyderabad. Bhopal. Mumbai. Different landscapes, same discipline. These collectives are not set dressing around a membership. They are restored ground where you can actually return, with your body and your attention, and meet something quieter than the pace you came from. Belonging matters here because passing through never changes you. It leaves you intact on the surface and unchanged underneath. Beforest is built for the opposite. For repetition, for familiarity, for the slow work of being known by a place. When land is restored and held with intent, it stops performing for you. It starts holding you. That changes everything about how rest feels. You are not consuming scenery. You are entering a living rhythm that has already been protected by someone else’s work. That is why the collective matters more than the individual stay. It gives your year a set of places you can return to without having to explain yourself each time. And once that exists, the question shifts. Not can I get away, but can I protect enough of my year to come back well.',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/image_4.jpeg',
    kind: 'scene',
  },
  {
    id: 'slide-07',
    title: 'Access changes behaviour faster than ownership.',
    note:
      'Clarify the model. Person-nights, recurring rhythm, no accumulation logic, and why access changes behaviour now.',
    script:
      'That is where the structure matters. Because access only changes behaviour when it has a rhythm attached to it. Thirty person-nights a year for ten years, that is the shape here. Not a pile of unused nights sitting somewhere on a ledger. Not an occasional indulgence when life finally loosens its grip. It is a recurring return, built to pull you back before the city fully rewires you again. The unit is person-nights because this is about individual practice, with room for immediate family to join when it makes sense. Children under twelve do not count toward that total. And the nights do not carry forward, because accumulation is not the point. Rhythm is. Ownership tends to make people postpone. Access does the opposite. It gives you a reason to protect time now, because the time is already waiting for you in a landscape that knows how to hold it. Across ten years, that becomes three hundred nights of intentional living. If you keep waiting for the perfect gap in your life, you do not just delay rest. You train yourself to live without it. The real question underneath this structure is simple. What happens if you stop postponing the reset?',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/image_24.png',
    kind: 'scene',
  },
  {
    id: 'slide-08',
    title: 'You decide with your feet, not your eyes.',
    note:
      'A second pause slide that prepares the move toward action.',
    script:
      'You decide with your feet, not your eyes.',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/image_24.png',
    kind: 'quote',
  },
  {
    id: 'slide-09',
    title: 'The cost of waiting is another year unchanged.',
    note:
      'State the real cost of delay without sounding salesy. Waiting costs clarity, margin, and restoration.',
    script:
      'Waiting has a cost, and it is never abstract. Another year goes by, and nothing in your life has been protected from the pace that is wearing it down. The thing you keep postponing is not a luxury. It is a rhythm of reset. A place to step out before the week, the quarter, the whole machinery of your life starts to blur everything together. Without that protected margin, the default keeps winning. Work expands. Attention thins. Family time gets squeezed into what is left over. And the body keeps carrying the bill long after the calendar has moved on. Beforest is designed to interrupt that pattern. Thirty person-nights a year, across ten years, as a practice of returning before you are fully spent. The real loss is not just a missed season in the forest. It is another year of running on unchecked momentum. Another year without the kind of calibration that makes the other ninety percent of your life sharper, steadier, more human. The question is not whether you can keep waiting. You can. The question is what that waiting is costing, quietly, in the background.',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/image_20.jpeg',
    kind: 'scene',
  },
  {
    id: 'slide-10',
    title: 'Start with the smallest real step.',
    note:
      'Move into the trial stay as the pilot. Experience first. Let the land answer before the commitment.',
    script:
      'The smallest real step is usually the hardest one to take, because it asks for honesty, not imagination. Blyton Bungalow is there for that reason. Not to impress you, not to close the conversation, just to put your body in the land long enough for it to answer back. A few nights in Coorg will tell you more than a polished explanation ever can. That is the point of the pilot. Experience before commitment. No leap, no performance of certainty, no forcing yourself into a decision before you have felt the texture of it. If the land gives you clarity, you will know it. If it does not, that is useful too. Either way, you are not guessing. The decision is not really about a membership. It is about whether ten percent of your year gets protected, or disappears into another year of being fully available to everything except yourself. So start there. Let the place do its work first. You decide with your feet, not your eyes.',
    imageUrl:
      'https://fjnkpphjtlaeijjcbejb.supabase.co/storage/v1/object/public/presentation-images/beforest/image_39.png',
    ctaLabel: 'Start your trial',
    ctaHref: 'https://hospitality.beforest.co',
    kind: 'cta',
  },
];

export const beforestBrandRules = `
Speak quietly but with certainty.
Speak to one person, never a room.
Beforest is a nature-first lifestyle collective and a land-restoration story first.
Frame the 10% life as protection, rhythm, reset, calibration, belonging, and intentional living.
Never call it a vacation, getaway, deal, property, or investment product.
Never use cheap urgency or hospitality pricing logic.
Never invent facts, numbers, locations, or promises.
Treat each slide like a scene, not a brochure.
Answer from the current slide first, then the broader approved deck if needed.
If an answer is outside approved content, say that clearly and stay cautious.
Treat the trial stay as the pilot, the first 1%, not a fallback.
Close with conviction, not pressure.
`;
