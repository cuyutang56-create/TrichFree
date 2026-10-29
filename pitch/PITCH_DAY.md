# TrichFree: pitch day script and Q&A

**Friday 30 October 2026, 3:00–3:30pm.** About 5 minutes of pitch, then 20 minutes of Q&A. Arrive by 2:50pm.

- **Speakers:** **XY** = Zhang Xinyi (statistics, evaluation, business), **CY** = Tang Caoyu (robotics and machine intelligence, product, tech).
- **Clicks:** `[CLICK]` means advance the slide.

---

## 1. Numbers to memorise

| What | Number | Say it as |
|---|---|---|
| Prevalence | 1.7% of adults (US study, n = 10,169) | "about one in sixty" |
| Mean age of onset | 17.7 years | "around seventeen, right at university age" |
| Daily work interference | 23% (online survey of 1,697 people with trich) | "one in four people with trich" |
| Therapy evidence | 24 RCTs, 857 participants: habit-reversal behavioural therapy has a large effect | "therapy works; its first step is awareness" |
| Hand / face landmarks | 21 hand points; face mesh used as a reference frame | |
| Reminder delay (Balanced) | 0.8 s for a pinch, 1.5 s for an open hand | "about a second" |
| Simulated median delay to reminder | 0.87 s | |
| Frame rate | about 15 fps on a GPU laptop; 11–14 fps on the CPU path | |
| Automated tests | 283 (192 unit, 57 database, 34 browser) | "software reliability, not accuracy" |
| Simulated detection | 350/350 reaches; 343/350 in the hardest condition; 0 false alerts in 250 everyday-move runs | "synthetic, not real-world" |
| Internal audit | 11 issues fixed: 1 high, 4 medium, 6 low | |
| Pilot design | 14 days: 3-day silent baseline, then each episode randomised to chime or own voice | |
| Quiet time | 30 s by default, at most one follow-up | "it never nags" |
| NUS beachhead | about 680 students (1.7% × about 40,000); an estimate | |
| Wearable price | about US$149–179 (Keen2, dated listings; check before pitching) | |

**Three sentences to say no matter what you're asked:**
1. "We don't know real-world accuracy yet, and we won't guess. Stage 1 measures it."
2. "TrichFree is a self-help awareness tool, not a treatment or a medical device."
3. "Video never leaves the laptop, and voice recordings are never uploaded."

---

## 2. The 5-minute pitch (about 650 words)

Pace: slow and warm. Pause where marked. Look at the judges, not the screen.

### Slide 1: It starts before you notice (XY, about 25 s)
> *(Stand still. Wait two seconds before speaking.)*
>
> Quick question. Did you touch your hair in the last five minutes?
>
> *(pause)*
>
> Most of us honestly don't know, and for most of us it doesn't matter. But for about one in sixty adults, that unnoticed touch is where trichotillomania begins: hair pulling they desperately want to stop, and often don't notice starting.
>
> We're TrichFree, and we build support for exactly that moment. `[CLICK]`

### Slide 2: Help arrives too late (XY, about 40 s)
> Trichotillomania affects about 1.7 percent of adults. It usually begins around seventeen, right as people arrive at university. And one in four people with it say it disrupts their work every day.
>
> The best-evidenced treatment, habit reversal therapy, starts with *awareness*. But much pulling is automatic. It happens while you're reading or studying, and you only notice afterwards. Therapy is weekly. Urges are not.
>
> A practitioner with more than thirty years of experience wrote to us:
>
> *(slowly)* "If you could get each individual to record something for themselves which would help them at the moment of the behaviour and somehow AUTOMATICALLY play it back to them when they began pulling, I think it would stop them."
>
> *(pause)* That is exactly what we had already started building. `[CLICK]`

### Slide 3: Meet TrichFree (CY, about 50 s)
> This is TrichFree, a browser extension that works with the webcam already on your laptop.
>
> *(point left)* This is what it sees: twenty-one points on your hand, your face as a reference frame, and a hair-segmentation model that knows where your hair is, even a lock held beside your face.
>
> *(point right)* You choose your areas: crown, hairline, temples, strands, brows, lashes. When your fingers pinch there for about a second, it doesn't buzz at you. It plays a soft chime, then *your own voice*: "Hey, it's me. Your hand is up there."
>
> And everything runs on your laptop. Video is never stored, and never sent anywhere. `[CLICK]`

### Slide 4: Competitive positioning (CY, about 30 s)
> Here's the landscape. Tracking apps and timers work *after* the moment. Wearables catch the moment, but with a generic buzz, and cost around a hundred and fifty US dollars. Therapy is deeply personal, but it lives between sessions.
>
> TrichFree is the only option here that's both in the moment *and* personal, on hardware people already own.
>
> To be honest about our limits: it only works at a desk, and we haven't measured real-world accuracy yet. `[CLICK]`

### Slide 5: Built, tested, ready to be proven (CY, about 40 s)
> And it's real. We have a working extension and website, and 283 automated tests.
>
> We built an evaluation harness that runs our real detector on simulated movements, including slow, noisy cameras. It caught 350 of 350 simulated reaches, with zero false alerts on drinking or resting your chin. That's synthetic data, not real-world accuracy. Measuring that is our next step.
>
> Our first real-user test actually *failed*. It missed a strand pulled beside the face. Within days we'd added hair segmentation. That's how we work: we listen, and we fix. `[CLICK]`

### Slide 6: Support should not be a privilege (XY, about 40 s)
> Support shouldn't depend on what you can afford.
>
> So individuals get the core tool free. And that's sustainable, because all the AI runs on the user's own laptop: no cloud GPUs, no video storage. Each extra user costs us almost nothing.
>
> Revenue would come from institutions, like university wellbeing services and BFRB organisations buying supported access for their communities, and later from practitioners.
>
> Our beachhead is NUS. On prevalence alone, that's roughly six hundred students.
>
> Whether institutions will pay is our biggest open question, and testing it properly is exactly why we need business mentorship. `[CLICK]`

### Slide 7: Every step earns the next (XY, about 35 s)
> So we'll climb one step at a time.
>
> First, label our hundred-plus founder trials and test with new users, to measure real accuracy.
>
> Second, an ethics-reviewed fourteen-day pilot, already built into the extension, comparing a chime with the user's own voice.
>
> Third, distribution trials with institutions. Fourth, practitioner-informed personalisation.
>
> Every step has a metric, and we will never confuse engagement with clinical effect. `[CLICK]`

### Slide 8: Team, ask, vision (CY, then XY, about 40 s)
> **CY:** I'm Caoyu. I built the computer-vision pipeline.
>
> **XY:** And I'm Xinyi. I designed the evaluation and the randomised pilot.
>
> **CY:** We kept going through hackathon setbacks because this matters to us. We can write the software. What we can't do alone is run an ethical study, reach institutions and build clinical partnerships. That's what NUSC unlocks.
>
> **XY:** *(slowly, warmly)* Tonight at 11:42, someone's hand will drift to their hair. We want the next thing they hear to be their own voice, saying: *it's okay. I've got you.*
>
> *(pause)* Thank you.

**If you're running long, cut:**
- the slide 4 limits sentence (save it for Q&A)
- "including slow, noisy cameras" on slide 5
- the "Third, Fourth" sentence on slide 7

Never cut the quote or the closing line.

---

## 3. How to answer in Q&A

**The formula:**
1. Acknowledge ("Good question", or "That's our biggest risk").
2. Give one piece of evidence.
3. Give the plan ("In Stage 1 we…").

Aim for 20–40 seconds per answer, then stop.

**Who answers:**
- CY: technical and product questions.
- XY: evaluation, statistics, business and impact questions.

The other founder may add one sentence, not a second answer.

**When you don't know:**
> "We don't know yet. Here's how we'll find out…"

This sounds stronger than guessing. Never invent a number.

**Traps:**
- Never say "cure", "treat", "clinically proven", "accurate", or "partnership" (for the practitioner).
- Never say "users" in the plural as if you have a user base.
- Don't argue with a judge. Say: "That's fair. Here's how we'd handle it."

---

## 4. Q&A bank

### A. Technical

**A1. How accurate is it in the real world?** *(CY, the most likely question)*
> "Honestly, we don't know yet, and we won't guess. What we have is simulation: our harness runs the real detector on synthetic movements, including 3 frames per second, landmark noise and missed hands. It caught 350 of 350 reaches, and 343 of 350 in the hardest condition, with zero false alerts on everyday moves. But synthetic data can't capture real lighting, skin tones or hairstyles. Stage 1 measures real sensitivity and false alerts per hour, with labelled trials and new users."

**A2. You said 100+ trials. What were the results?** *(XY)*
> "Those were informal tests by the two of us while developing. We didn't log them with labels, so we won't quote an accuracy figure from them. Our first Stage 1 task is to repeat them properly: every trial labelled, conditions recorded, then sensitivity and false-alert rate reported separately."

**A3. How does detection actually work?** *(CY)*
> "Three on-device models from Google's MediaPipe: hand landmarks, face landmarks and hair segmentation. We use the face as a coordinate frame, so the zones follow your head as you move. Each frame gets a score from three things: whether the hand is in one of your zones, whether it's at face depth rather than in front of the camera, and whether the fingers are pinching or touching hair. The score is smoothed over time, and a reminder needs about 0.8 seconds of a pinch, or 1.5 seconds of an open hand, so brief touches stay quiet."

**A4. What about false positives, like scratching your head or fixing your hair?** *(CY)*
> "Scratching the scalp is a known false positive: from landmarks alone it looks like a reach, and we keep it in our test set on purpose so we don't hide it. Users have three controls: sensitivity levels, a 30-second quiet time, and a 'Not a pull' button. That button also trains a small personal model on their own device, so it learns their habits."

**A5. And false negatives, the pulls it misses?** *(CY)*
> "Our first real user showed us one: a strand pulled beside the face, outside the scalp zones. We added hair segmentation and a 'strands' zone because of it. Other likely misses are a hand outside the camera's view, a face turned away, or poor lighting. That's why we'll report misses separately in Stage 1, and why there's an 'I just pulled' button to log what the camera missed."

**A6. What's the personal model? Is it AI that could go wrong?** *(CY)*
> "It's a simple logistic regression trained only on that user's own feedback, on their device. It only switches on if it passes an accuracy check on held-out data. And it can only confirm or cancel a reminder inside the user's zones; it can never trigger one by itself. So it can make things quieter or more precise, but it can't start alerting randomly."

**A7. Does it work on low-end laptops?** *(CY)*
> "It uses the GPU when available, at about 15 frames per second. Without a GPU it falls back to a faster CPU path: 11 to 14 frames per second on our test machine. Our simulations show detection holds even at 3 frames per second. But we've measured resource use on only one machine, so testing on typical student laptops is part of Stage 1."

**A8. Does it work when I'm in another app, or full-screen?** *(CY)*
> "It's designed to. The camera runs in a background extension document, so you can keep working in any app. Automated background soak tests held about 15 fps. We still need to verify it by hand on real Mac and Windows laptops over long sessions; that's on our checklist."

**A9. What about different skin tones, hair types and head coverings?** *(CY)*
> "This is an equity risk we take seriously, and it's untested. MediaPipe is a widely used model, but we haven't verified it on our use case across skin tones, hair textures, hijabs or headscarves. We will test across those groups before claiming the tool works for everyone. If someone covers their hair, the hair zones won't apply, but scalp zones based on hand position still can."

**A10. Why a webcam and not a phone or a wearable?** *(CY)*
> "Our beachhead is the desk. Students spend hours at laptops, and automatic pulling often happens during sedentary tasks like reading and studying. The webcam is already pointing at you, so nothing new is needed. A phone usually isn't facing you while you study. Wearables are great for portability, and many people could use both."

**A11. Your code is public on GitHub. Can't anyone copy you?** *(CY)*
> "Yes, the code is visible, and that helps trust: anyone can check our privacy claims. Our defensibility isn't the code. It's what we're building around it: trust with the trich community, consented pilot evidence, practitioner relationships and institutional channels. We'll also review our licence choice with mentors."

**A12. Did you use AI tools to write the code?** *(answer truthfully)*
> If you did: "Yes, we used AI coding assistants to move fast, like many teams now. We made the design decisions, set the requirements, tested every feature, and ran the first user test ourselves. And we're clear that our audit was internal, not external."

**A13. What's the latency from reach to sound?** *(CY)*
> "In simulation, the median is 0.87 seconds from the hand arriving to the reminder. Most of that is a deliberate pause, so brief touches don't trigger anything. Our target for the sound itself is under 300 milliseconds after the decision. We log it, but we still need to verify it on real laptops."

### B. Social impact and users

**B1. How do you know people want this?** *(XY)*
> "Today our evidence is the research, the practitioner's feedback, and our first user test. That's early, and we know it. Structured user interviews and the 14-day pilot are exactly how we'll validate demand: we'll measure whether people choose to keep using it voluntarily."

**B2. How will you measure social impact?** *(XY)*
> "We'll measure separately:
> - detection quality: sensitivity, and false alerts per hour
> - acceptability: does the reminder feel helpful or intrusive?
> - hand-down rate after a reminder, chime versus own voice, within the same person
> - voluntary 14-day retention
> - privacy incidents, with a target of zero
> - how many people get free access
>
> We won't call engagement 'clinical effectiveness'. That would need a proper clinical study."

**B3. Couldn't a reminder make someone feel ashamed or anxious?** *(XY)*
> "Yes, it's a real risk, and we designed against it. The wording is kind and chosen by the user. There are no failure counts; our streak counts showing up, never pull-free days. Users can choose visual-only or off. There's a quiet time, and at most one follow-up. Support contacts are in the extension. The pilot will also directly ask about distress and acceptability, after ethics review."

**B4. Why own voice? Is there evidence it works better than a chime?** *(XY)*
> "Not yet, and that's our pilot's main question. The idea comes from the practitioner's experience and from how habit reversal therapy builds awareness. Our pilot randomises each episode to chime or own voice within the same person, so each person is their own comparison."

**B5. Who exactly is your user?** *(XY)*
> "Adults with trichotillomania, or recurring hair pulling, who spend long periods at a laptop. Students first, then desk-based workers. Our initial context is the NUS community, in English, on Chrome or Edge."

**B6. Isn't Mochi the mascot childish for a mental-health tool?** *(CY)*
> "It's optional and off by default. Its job is to reward showing up, never to judge. You can squeeze it as a 'something to do with your hands' alternative, which is a common competing-response strategy. Anyone who prefers a calm tool can turn it off."

**B7. Could this replace therapy?** *(XY)*
> "No. Therapy is the gold standard, and we complement it. We help between sessions, or for people who can't access therapy yet. Long-term, we'd like practitioners to help clients write their own reminder lines."

**B8. What about other BFRBs, like skin picking or nail biting?** *(CY)*
> "Our engine tracks the hand relative to the face, so in principle it could extend to other face-related BFRBs. But it isn't built or tested for them, and we'll stay focused on hair pulling until we have evidence."

### C. Business plan

**C1. Who pays, and how much?** *(XY)*
> "Individuals don't pay for the core tool. Our hypothesis is that institutions pay: university wellbeing services, counselling centres and BFRB organisations, for example through an annual per-student licence. We haven't set a price, because we haven't spoken to buyers yet. Finding the price and the actual buyer is a Stage 3 goal, and it's where we need business mentorship."

**C2. Why would a university pay for this?** *(XY)*
> "Universities already fund student wellbeing. One licence reaches many students, and it's low-cost compared with one-to-one services. It also needs no hardware and protects privacy, which matters to institutions. But it's a hypothesis. We need conversations with wellbeing offices to confirm the need, the budget holder and the procurement process."

**C3. How is a free tier sustainable?** *(XY)*
> "Because the AI runs on the user's device, we have no GPU servers and no video storage, so each extra user costs us almost nothing. Our fixed costs are small: hosting, a one-time Chrome Web Store developer fee, and testing devices. Institutional licences, grants or partners cover those."

**C4. What if institutions won't pay?** *(XY)*
> "Then we test our fallbacks: a low-cost optional premium tier, partnerships with BFRB organisations, or grants and impact funding. Because our costs are so low, we can keep the free tool running while we find the right model."

**C5. What's your market size?** *(XY)*
> "About 1 in 60 adults live with trichotillomania, based on a large US study. Applied to Singapore, that's roughly 80,000 adults, and about 680 NUS students. Those are illustrative estimates. We start with NUS, then other Singapore universities, then BFRB communities online."

**C6. Who are your competitors?** *(CY)*
> "The closest is wearables, like HabitAware's Keen2 bracelet, which vibrates when it detects a gesture. Then tracking apps, which log after the moment, and therapy. Wearables are portable, which we're not. Our differences: no device to buy, a cue in your own voice, and knowing where the hand is relative to the hair."

**C7. How will you acquire users?** *(XY)*
> "Through trusted channels, not ads: university wellbeing services, BFRB communities and support organisations, and practitioners. The extension is free, installs in a minute, and works without an account."

**C8. How much funding do you need, and for what?** *(XY)*
> Prepare a real number from the Info Kit. Structure:
> - Pilot participant reimbursement and ethics administration: S$___
> - Real-laptop testing across devices and conditions: S$___
> - External security and accessibility review: S$___
> - Hosting, store fees, tools: S$___
> - User research (interviews, incentives): S$___
>
> "Each item maps to a step on our staircase."

**C9. What does success look like in 12 months?** *(XY)*
> "Measured detection accuracy on real users. A completed ethics-reviewed pilot with an honest result, chime versus own voice. At least one institution testing supported access. And zero privacy incidents."

**C10. Is this a business or a charity?** *(XY)*
> "A social enterprise. The mission comes first, which is why individual access is free, but we need sustainable revenue to keep it running and improving. That's why institutional revenue matters."

### D. Ethics, privacy and regulation

**D1. A webcam watching me for hours is creepy. How is it private?** *(CY)*
> "Video is processed in memory on your laptop and never stored or sent. Voice recordings never leave your computer either. The extension makes no other network requests, and automated tests enforce that. The camera turns off when you stop or pause, monitoring auto-stops after 3 hours, and it stops when your computer goes idle or locks."

**D2. What data do you collect?** *(CY)*
> "In normal use, nothing leaves the device unless you create an optional account, and then only your settings sync. In the pilot, participants consent to send pseudonymous data, keyed to a random code: episode times, which zone, which reminder played, whether the hand came down, and their feedback taps. Never video, never audio, never names."

**D3. Is it a medical device? What about HSA regulation?** *(XY)*
> "We position it as a self-help awareness tool, with no diagnostic or treatment claims, and the extension says so clearly. If we ever wanted to make clinical claims, we'd need clinical evidence and would seek regulatory guidance first."

**D4. Ethics for the pilot?** *(XY)*
> "We'll seek review through the NUS ethics process (the IRB) before any real-user pilot. That covers informed consent, adults only, a code list kept offline, the right to withdraw and delete data, and support resources. Our own release audit said 'no-go yet' for a pilot until those steps are done, and we agree."

**D5. What if a user is in crisis?** *(XY)*
> "TrichFree isn't a crisis service, and it says so. It shows support contacts, including Singapore helplines like SOS on 1767. Our wording avoids shame, and the pilot will monitor distress."

**D6. Was your security audited?** *(CY)*
> "Internally. Our own release audit found and fixed 11 issues; the most serious was the camera staying on after 'turn camera off'. There has been no external review yet. That's one of the things funding would cover."

**D7. Could a minor use it?** *(XY)*
> "Our target is adults. Onset is often in the teenage years, so parents may ask. Any use by under-18s, especially in research, would need guardian consent and would be handled carefully under ethics review."

**D8. What if the reminder triggers at the wrong time, say during a Zoom call?** *(CY)*
> "There's a visual-only mode, and a one-click 15-minute pause. If another app takes the camera, TrichFree shows a pause badge and resumes once the camera is free."

### E. Team and NUSC fit

**E1. Why are you the right team?** *(both)*
> **CY:** "I built the computer-vision pipeline."
>
> **XY:** "And I designed the evaluation and the randomised pilot. Together we cover building it and measuring it honestly. And we've shown we keep going: after a failed user test, we shipped a fix within days."

**E2. Are you committed beyond this competition? How much time can you give as students?** *(both)*
> Answer truthfully with specifics: hours per week, and plans after this semester. "We already built this beyond our NExT project. Incubation would let us make it a sustained commitment."

**E3. Why should NUSC select you?** *(XY)*
> "The groundwork is done: a working, tested product grown from a NExT project, plus early expert engagement. We're candid about what's unproven, and we have a staged plan to prove it. What we lack is what incubation provides: clinical and ethics mentorship, access to users, business-model testing and introductions. And the problem starts at university age, so NUS is the natural place to begin."

**E4. What happens if you're not selected?** *(CY)*
> "We'll keep going at a slower pace: run labelled trials ourselves and talk to users. But without mentorship and ethics support, the pilot and institutional work would take much longer."

**E5. What's the biggest risk to TrichFree?** *(XY)*
> "Two. First, real-world detection may not be good enough. We'll know after Stage 1, and we'll adapt the zones and models, or narrow the use case. Second, institutions may not pay, so we test that early. Neither risk is hidden; both are built into our plan."

**E6. Do you have a personal connection to the problem?** *(only if comfortable)*
> You never have to share personal health information. Option: "This matters to us personally, and we've spent a lot of time with the research and with the people who support others with it."

### F. Curveballs

**F1. "This sounds like surveillance."**
> "We understand that worry. It's why we made processing fully local and the controls fully the user's. It's a tool you switch on for yourself, like a fitness tracker that never phones home."

**F2. "Isn't 5 minutes of flashy simulation numbers misleading?"**
> "That's why we label every number. Software tests measure reliability, simulation measures logic, and only Stage 1 will measure real accuracy. We'd rather show you exactly where we are."

**F3. "What did the practitioner actually commit to?"**
> "Nothing formal. They shared that idea and offered to stay in touch. It's early interest, not a partnership or an endorsement."

**F4. "Why not just a timer reminding you every 10 minutes?"**
> "Because automatic pulling doesn't follow a schedule. A timer interrupts you when nothing is happening and misses the moment when it is. We respond to the actual movement."

**F5. "What would make you shut this down?"**
> "If the pilot showed the reminders cause more distress than help, or if detection can't reach an acceptable false-alert rate, we'd change course. We'd rather pivot than ship something that doesn't help."

---

## 5. Day-of checklist

- [ ] Slides emailed by Thu 29 Oct, 5pm. Bring a USB stick with the PPTX and PDF as backup.
- [ ] Rehearse twice with a timer, with clicker handovers (slide 3 → CY, slide 6 → XY, slide 8 → both).
- [ ] Arrive by 2:50pm: NUSC Admin Wing, Ground Floor Conference Room.
- [ ] Optional: the extension running on a laptop for a live demo in Q&A, if the panel asks. Test it first in that room's lighting.
- [ ] Bring the funding numbers from the Info Kit (question C8).
- [ ] Agree beforehand: who answers which category, and who will say "let me add one thing."
- [ ] End the Q&A by thanking them and restating the ask in one line: "With NUSC's mentorship, we can turn a working prototype into evidence-based support."
