# Beforest app test checklist

Use this checklist after each deploy or meaningful UI/narration change.

## 1. Access and start

- Can you open the app on desktop and mobile without layout breakage?
- If passcode is enabled, does the app block access until the right passcode is entered?
- Does the name/passcode form feel clear and easy to complete?
- After entering access details, does the `Begin walkthrough` button appear?
- When you tap `Begin walkthrough`, does narration start quickly without waiting for Gemini Live?
- Does the background video play smoothly within the first 3-5 seconds?

## 2. Core narration

- In the first 10 seconds, does the narrator clearly explain what Beforest is?
- Does the opening mention collectives, hospitality, Bewild food, full membership, and 10% access?
- Is 10% described as `30 person-nights a year for 10 years`, not just `30 nights`?
- Does the narrator sound like an adult talking to another adult?
- Does the narration avoid sounding like a sales pitch, spiritual talk, or tourism copy?
- Are the audio chunks paced naturally, without long silence or abrupt cuts?
- Do subtitles match the audio timing closely?
- Are subtitles readable but not distracting?
- Does the video continue smoothly while narration and subtitles are running?

## 3. Guided flow

- Does each section move naturally into the next?
- Do the pause questions feel useful rather than interruptive?
- Are the multiple-choice options clear and relevant?
- After selecting an option, does the walkthrough continue correctly?
- Does the app stay guided instead of becoming a generic chatbot over slides?
- Does it eventually move toward the trial stay or updates path?

## 4. Mic interaction

- Is it obvious what the mic button does before tapping it?
- When you tap the mic, does the UI clearly say `Speak now`?
- Does the narrator pause only when the mic is actually ready?
- Does the screen explain that you should tap send when your question is complete?
- Does the mic icon change to a send icon clearly?
- Does the send icon look premium and neutral, without odd green boxes?
- If you ask a short question, does the app capture enough of it?
- After tapping send, does Gemini answer the specific question?
- Does the answer stay brief and grounded in Beforest?
- After the answer, does narration resume cleanly?
- If Gemini Live is unavailable or returns a 503, does the walkthrough continue instead of feeling broken?

## 5. Visual quality

- Do overlays read as premium black, not brown or muddy?
- Does text remain readable over all parts of the video?
- Do the mic, pause, CTA, and modal controls look consistent?
- Are there any visible green, accidental, or debug-looking states?
- Does the app avoid bulky dashboard/card styling?
- On mobile, do buttons stay tappable and not overlap captions?
- On desktop, does the layout feel calm and cinematic rather than empty or cluttered?

## 6. CTAs and updates

- Does the trial stay CTA appear at the right point?
- Does the trial stay CTA open the correct hospitality link?
- Does the updates path ask for name, email, and phone clearly?
- Do the update preference questions feel relevant?
- After completing updates, does the app open the Founding Silence link with the right query parameters?
- Can the user close or back out of the updates flow?

## 7. Error and edge cases

- What happens if you deny microphone permission?
- What happens if you tap mic and say nothing?
- What happens if you tap mic, wait, then tap send?
- What happens if Gemini Live fails or times out?
- Does the narrator resume after mic errors?
- Does pause/resume still work after using the mic?
- Does the app recover if the network is slow?
- Does refreshing the page reset to a sensible state?

## 8. Final acceptance

- Would a first-time visitor understand Beforest within the first 10 seconds?
- Would they understand that 10% means 30 person-nights per year for 10 years?
- Would someone coming from hospitality understand how this connects to collectives?
- Would someone coming from Bewild understand how food connects to the landscapes?
- Would someone who does not want full ownership understand why 10% exists?
- Does the whole experience feel guided, premium, calm, and clear?
