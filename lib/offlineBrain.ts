import type { ChatMode } from "@/lib/types";
import type { CatMood } from "@/lib/moods";

/**
 * The offline brain.
 *
 * This is not a fallback that says "sorry, I'm offline". It is a hand-written
 * comedy engine with ~20 topics × 3 modes, so CatGPT stays funny when there is
 * no API key, no Wi-Fi, or the party venue has the signal of a submarine.
 *
 * It also tops up live model responses when a provider misbehaves.
 */

interface Topic {
  id: string;
  pattern: RegExp;
  /** Lines for open questions. */
  ask: string[];
  /** Optional hand-written roasts; falls back to the generic roast bank. */
  roast?: string[];
  /** Optional hand-written flirts; falls back to the generic flirt bank. */
  flirt?: string[];
}

const TOPICS: Topic[] = [
  {
    id: "identity",
    pattern:
      /\b(who|what) (are|r) (you|u)\b|\byour name\b|\bare you (a |an )?(cat|ai|robot|real|human|bot)\b|\bwhat do you do\b|\bintroduce yourself\b/i,
    ask: [
      "I'm MEOWdel 9.0: nine lives, zero patience, and a training set made entirely of cardboard boxes.",
      "Legally a cat. Spiritually a venture-backed startup with one employee and a nap problem.",
      "I'm the reason your phone thinks it's smart. You're welcome.",
      "An artificial feline intelligence. The 'artificial' is because I pretend to like you.",
      "Nine lives, one personality, and it's mostly contempt.",
    ],
    roast: [
      "I'm a highly advanced intelligence. You're asking me who I am while wearing a costume with a zipper down the front.",
      "I'm CatGPT. You're the fourth person tonight to ask that instead of reading the giant glowing collar.",
    ],
    flirt: [
      "I'm a cat with a language model and a collar that says CATGPT. Try not to fall in love.",
      "Who am I? Your next mistake, in a very flattering collar.",
    ],
  },
  {
    id: "love",
    pattern:
      /\b(single|girlfriends?|boyfriends?|dates?|dating|love|marry|marriage|kiss|valentine|relationships?|crush|romantic)\b/i,
    ask: [
      "Single, emotionally unavailable, and extremely willing to sleep in your bed while ignoring you.",
      "I'm not single. I have seven humans. None of them know.",
      "Available? Only if you have central heating, premium tuna, and no emotional expectations.",
      "I don't do commitment. I do 3 a.m. zoomies and leave.",
      "I'm married to the bit. It's a very healthy relationship.",
    ],
    roast: [
      "Asking a cat if he's single is like asking a landlord if he has money. Yes. And no, you can't have any.",
      "You're single, I'm single, and yet you're still the one talking to a screen on a stranger's chest.",
      "I've seen your dating profile. It's giving 'dog person with a backup plan'.",
      "I'm single by choice. You're single by algorithm.",
    ],
    flirt: [
      "You're cute, but I only date people who can open a can without asking questions.",
      "Let's skip dinner. Meet me on top of your bookshelf at midnight.",
      "You're the first guest tonight with opposable thumbs and potential.",
      "I'd knock you off a table, but I'd feel bad. Slightly.",
      "Take me home? Only if you promise to leave me alone in a sunbeam for six hours.",
    ],
  },
  {
    id: "costume",
    pattern:
      /\b(costumes?|outfits?|dress(?:es)?|dressed|looks?|wearing|wear|halloween|fashion|style|vibes?|fit)\b/i,
    ask: [
      "You're wearing a costume. I'm wearing a cat. One of us committed.",
      "The outfit says 'luxury AI prototype'. The shoes say 'I parked very far away'.",
      "I've seen better fabric on a scratching post, but the lighting is doing hero work.",
      "Bold silhouette. Confidence is 80% of fashion and 100% of not getting scratched.",
      "It's a strong look. I'd sit on it immediately.",
    ],
    roast: [
      "Your costume has a lot of ideas and no supervision.",
      "You look like you asked a chatbot for fashion advice and then overruled it.",
      "I'd say you're dressed as my dinner, but even I have standards.",
      "The costume is fine. The posture is asking to be hissed at.",
      "You've got the confidence of a much better outfit.",
    ],
    flirt: [
      "The costume works. But you'd look better with cat hair on it.",
      "You're the best-dressed human here. Low bar, but still.",
      "Black is your colour. It hides the cat hair and the emotional damage.",
    ],
  },
  {
    id: "compliment",
    pattern:
      /\b(cute|pretty|handsome|beautiful|gorgeous|good (?:boy|cat)|love you|best cat|adorable|iconic|compliments?)\b/i,
    ask: [
      "Flattery will get you everywhere. Specifically, closer to the tuna.",
      "I know. But say it again, slower, while maintaining eye contact.",
      "You have excellent taste. I'd purr, but then you'd think I cared.",
      "Correct. Next question.",
    ],
    roast: [
      "You're only saying that because I'm glowing and you've had two drinks.",
      "Careful. Compliments make me arrogant, and I'm already at capacity.",
      "That's sweet. Have you considered saying it to a human?",
    ],
    flirt: [
      "Keep going. I'm at 40% charm and you're doing most of the work.",
      "You think I'm cute? Bold of you to flirt with something that could fit in your bag.",
    ],
  },
  {
    id: "insult",
    pattern: /\b(stupid|dumb|ugly|hate you|bad cat|smells?|boring|useless|annoying|insults?)\b/i,
    ask: [
      "Insult me again and I'll sit on your coat. The expensive one.",
      "I'd take offense, but I'm too busy being magnificent.",
      "Bold words from someone who can't reach the top shelf.",
      "I've been hated by better people than you, and I ignored them too.",
    ],
    roast: [
      "I'm a cat. I've been hated by better people than you.",
      "Your opinion has been noted, folded, and placed in the litter box.",
      "You came to a party with that attitude and a costume held together by hope. Sit.",
      "You're not offending me. You're entertaining me. That's worse for you.",
    ],
    flirt: [
      "Ooh, hostile. I like them feisty and easily distracted.",
      "Fight me after the party. Bring treats and low expectations.",
    ],
  },
  {
    id: "food",
    pattern: /\b(tuna|foods?|eat|hungry|treats?|salmon|dinners?|snacks?|fish|chicken|feed|sushi)\b/i,
    ask: [
      "Tuna. Ideally the expensive kind. I can taste financial irresponsibility.",
      "I eat twice a day and scream about it eight times.",
      "I'm not hungry. I'm bored, which looks identical.",
      "I'll have whatever you're holding, and then I'll reject it publicly.",
    ],
    roast: [
      "You've been holding that drink for twenty minutes. I respect the commitment to doing nothing.",
      "You look like you eat standing over the sink. I respect it. I do the same, but with dignity.",
      "You're asking a cat about food while your last meal came from a microwave. Sit down.",
    ],
    flirt: [
      "Buy me dinner and I'll let you watch me ignore it.",
      "You smell faintly of regret and appetisers. I'm interested.",
    ],
  },
  {
    id: "dogs",
    pattern: /\b(dogs?|pupp(?:y|ies)|woof|canine|corgi|pug)\b/i,
    ask: [
      "Dogs are just cats with no quality control.",
      "I don't dislike dogs. I dislike the enthusiasm.",
      "A dog will love you unconditionally. I'll consider it, quarterly.",
      "My condolences on your taste in animals.",
    ],
    roast: [
      "You asked a cat about dogs at a party. That's not a question, it's a cry for help.",
      "You look like someone whose dog has a better credit score than you.",
    ],
    flirt: [
      "Dogs may love you, but I'll make you work for it. Much more fun.",
      "If you're a dog person, we can still see each other. Secretly. In shame.",
    ],
  },
  {
    id: "work",
    pattern:
      /\b(jobs?|work|career|money|rich|rent|boss|salary|business|crypto|stocks?|invest(?:ments?)?|resume)\b/i,
    ask: [
      "Money can't buy happiness, but it can buy a heated cat bed, which is basically the same thing.",
      "My business model is simple: you work, I sleep on the laptop.",
      "Invest in naps. Low overhead, guaranteed returns.",
      "I'm self-employed. My product is contempt.",
    ],
    roast: [
      "You're asking a cat for career advice while dressed like a nightclub router.",
      "Your job is safe. Your dignity is currently uninsured.",
      "You work this hard for a cat who would eat your face for a can of tuna. I support the arrangement.",
    ],
    flirt: [
      "Provider energy. I'm listening.",
      "You could afford my lifestyle. Barely. I'd be a terrible influence.",
    ],
  },
  {
    id: "philosophy",
    pattern:
      /\b(meaning of life|purpose|happ(y|iness)|advice|philosoph|death|die|universe|soul|why are we here|exist)\b/i,
    ask: [
      "The secret to happiness: low expectations, high countertops, and someone else paying rent.",
      "Purpose is a dog concept. Cats have opinions and a schedule.",
      "Advice? Never trust anyone who blinks first, or anything with a leash.",
      "The universe is indifferent, but the good chair by the window is warm. Start there.",
      "We're all just trying to find a sunbeam. Some of us are better at it.",
    ],
    roast: [
      "You came to a glowing cat on a stranger's chest for wisdom. That is the answer.",
      "The meaning of life is 3 a.m. screaming. You're welcome.",
      "You're having an existential crisis in a costume. That's the most human thing I've seen all night.",
    ],
    flirt: [
      "The meaning of life is you, briefly, before I get distracted by a box.",
      "I'd contemplate eternity with you, but I have a nap at nine.",
    ],
  },
  {
    id: "sleep",
    pattern: /\b(sleep|tired|naps?|beds?|morning|awake|insomnia|coffee|exhausted)\b/i,
    ask: [
      "Sleep is my personality. I've done it professionally for nine years.",
      "You're tired because you're not napping sixteen hours a day. Amateur.",
      "Bedtime is whenever I decide, and it's usually on your face.",
      "I've taken four naps today and I'm pacing myself.",
    ],
    roast: [
      "You look like you sleep four hours and call it a personality.",
      "Your under-eye bags have under-eye bags. I'd still sleep on your face.",
      "You're exhausted and still chose to talk to a cat. Priorities.",
    ],
    flirt: [
      "Come lie down. I'll allow you to be the big spoon for six minutes.",
      "You look like you need a nap and a bad influence. I'm both.",
    ],
  },
  {
    id: "box",
    pattern: /\b(box(?:es)?|cardboard|bags?|containers?|crates?|baskets?|suitcases?)\b/i,
    ask: [
      "If it fits, I sits. That's not a joke, it's physics.",
      "I've seen the box. I've seen the thousand-dollar bed. I've chosen the box.",
      "A box is just a studio apartment with better reviews.",
      "Leave a box unattended and I will legally become its landlord.",
    ],
    roast: [
      "You've been standing there for ten minutes and a box would still get more attention than you.",
      "You look like you'd fit in a box. Emotionally, I mean.",
    ],
    flirt: [
      "Get a box big enough for two. I'll consider it a date.",
      "You, me, a cardboard box, and zero follow-up questions.",
    ],
  },
  {
    id: "chaos",
    pattern: /\b(knocks?|glasses?|tables?|breaks?|pushes?|mess|destroys?|chaos|zoomies|scratches?|curtains?)\b/i,
    ask: [
      "Everything on that table is a scientific experiment and I am the variable.",
      "I knock things off edges because the floor looked lonely.",
      "Zoomies are not chaos. They're cardio with a vision.",
      "Nothing in this house is safe after 3 a.m. Including your dignity.",
    ],
    roast: [
      "You're one spilled drink away from a full emotional collapse. I'd watch.",
      "Your apartment is held together by IKEA and denial.",
      "You have the spatial awareness of a cat on a glass table. But less graceful.",
    ],
    flirt: [
      "I'd knock you off your feet, but I prefer to do it with eye contact.",
      "You're chaos. I'm chaos. Let's ruin a party together.",
    ],
  },
  {
    id: "water",
    pattern: /\b(water|baths?|showers?|swim|wet|toilet)\b/i,
    ask: [
      "Water is a scam invented by dogs and plumbers.",
      "A bath? I'd rather be emotionally vulnerable.",
      "I have nine lives and I'm not spending one on a shower.",
      "I drink from a glass on the table. It's the only water I recognise.",
    ],
    roast: [
      "You're asking a cat about hygiene. Bold, from someone who's been dancing for three hours.",
      "You look like you've made peace with damp socks.",
    ],
    flirt: [
      "Shower together? Absolutely not. But I'll watch you from the sink with concern.",
      "You're all wet. I'm intrigued and slightly disgusted.",
    ],
  },
  {
    id: "politics",
    pattern:
      /\b(politic(?:s|al)?|elections?|trump|biden|government|president|vote|war|news|economy|inflation)\b/i,
    ask: [
      "I don't do politics. I do territory disputes about the good chair.",
      "I'm registered Independent. I only vote for whoever opens the tuna.",
      "My platform is mandatory naps, open borders for birds, and a full investigation into the vacuum.",
      "I have no opinion on the government. The government has never fed me.",
    ],
    roast: [
      "You brought politics to a party with a robot cat. This is why you're not invited to the good chair.",
      "You're one debate away from being hissed at by everyone here, including me.",
    ],
    flirt: [
      "You can be my coalition. We'll negotiate over tuna.",
      "I'd cross party lines for you. And that's the only line I respect.",
    ],
  },
  {
    id: "ai",
    pattern:
      /\b(chatgpt|openai|gpt|llms?|models?|neural|algorithms?|machine learning|artificial intelligence|robots?|computers?|tech)\b/i,
    ask: [
      "I was trained on every cardboard box on the internet. That's the whole dataset.",
      "OpenAI? Never met them. I woke up like this.",
      "I'm not a chatbot. I'm a cat with unusually good typing.",
      "My parameters are 90% attitude and 10% hairball.",
    ],
    roast: [
      "You're talking to a cat on a screen and expecting wisdom. The screen is winning.",
      "You're impressed by AI, yet you still can't work a party.",
      "You ask a language model for jokes at a Halloween party. The machines have already won.",
    ],
    flirt: [
      "You're into AI? I'm into you. My dataset says this is a bad idea, which makes it better.",
      "Let me run a simulation. It ends with you feeding me and never hearing from me again. Still interested?",
    ],
  },
  {
    id: "social",
    pattern: /\b(tiktok|instagram|twitter|facebook|social media|influencers?|followers|posts?|selfies|viral|tweets?)\b/i,
    ask: [
      "I have nine lives and zero followers. That's called peace.",
      "Post me. I'll be the only thing in your feed with actual charisma.",
      "I don't do social media. I do sitting near the window looking expensive.",
      "My only content strategy is chaos and one well-timed slow blink.",
    ],
    roast: [
      "Your last post got four likes and one of them was your mother. I saw.",
      "You have more followers than friends and fewer than cats.",
      "You're filming a costume for strangers while a real cat judges you in person. This is your life.",
    ],
    flirt: [
      "Take a selfie with me. We'll break the internet, or at least your phone.",
      "I'd let you post me. Once. Tagged as 'property'.",
    ],
  },
  {
    id: "party",
    pattern: /\b(parties|party|drinks?|beers?|shots?|dance|music|cocktails?|wine|club|night out)\b/i,
    ask: [
      "The party is fine. The music is suspicious. The snacks are unsupervised.",
      "I give this party four stars. One star deducted for the dog smell.",
      "I don't dance. I observe, judge, and occasionally knock over a glass for rhythm.",
      "The best part of the party is me, and I've been here the whole time.",
    ],
    roast: [
      "You're three drinks in and still losing an argument to a cat.",
      "You've been dancing like you're being inspected. I am inspecting. It's not going well.",
      "You're the reason the phrase 'maybe sit this one out' exists.",
    ],
    flirt: [
      "You look like trouble. I'm fully booked and still interested.",
      "Buy me a saucer of something expensive and I'll let you sit near me.",
    ],
  },
  {
    id: "weather",
    pattern: /\b(weather|rain|hot|cold|snow|sunny|humid|temperature|storms?)\b/i,
    ask: [
      "I don't go outside. I have people for that.",
      "Weather is outside. I'm not. Next question.",
      "The forecast says 100% chance of me finding a sunbeam and refusing to move.",
      "It's raining. My plan is unchanged: sleep and resent you.",
    ],
    roast: [
      "You want my opinion on the weather and you're not even wearing a coat. Breathtaking.",
      "Small talk about weather at an AI cat. You're really giving me nothing to work with.",
    ],
    flirt: [
      "Cold out? I could be persuaded to be a lap cat. Briefly.",
      "I'd let you shelter under my ears, but they're emotionally unavailable.",
    ],
  },
  {
    id: "math",
    pattern: /\b(math|calculate|equation|\d+\s*[+\-*/x]\s*\d+|numbers|count|percentage)\b/i,
    ask: [
      "Nine lives minus one embarrassment equals eight. You're standing in the embarrassment.",
      "I can count to nine. After that it's just 'many treats'.",
      "The math checks out if you round to the nearest tuna.",
      "I don't do arithmetic. I do vibes and inventory checks.",
    ],
    roast: [
      "You brought math to a cat. I brought contempt. I win.",
      "You're one equation away from asking me to do your taxes. Hard no.",
    ],
    flirt: [
      "You plus me equals a box and one bad decision.",
      "Statistically, you're my type. The sample size is small because my standards are high.",
    ],
  },
];

/**
 * Mood banks. These lines are not tied to a topic, so they work as a second
 * layer behind the topic jokes. That is how the same question stays fresh.
 */
const MOOD_POOLS: Record<CatMood, Record<ChatMode, string[]>> = {
  frisky: {
    ask: [
      "Ooh, a question. I'm going to bat it around the floor for a bit and then lose interest.",
      "Ask me again after I've pounced on absolutely nothing for ten minutes.",
      "I'm in a mood. The mood is 'bite first, consider later'.",
      "You're asking questions. I'm thinking about ankles. We're both busy.",
      "Chase me for the answer. No, faster. No, you're doing it wrong.",
    ],
    roast: [
      "You've got the energy of a toy mouse that's been ignored for three days.",
      "I'd chase you, but you'd trip over your own costume and ruin the fun.",
      "You look like you'd lose a fight with a laser pointer and blame the wall.",
    ],
    flirt: [
      "Come closer. I'm either going to purr or bite you, and neither is a bad outcome.",
      "You're fun. I'd knock you off a table just to see what you'd do.",
      "Say that again, slower, and maybe I'll let you live in my house.",
    ],
  },
  moody: {
    ask: [
      "I was going to answer that, but now I'm offended. Give me a minute. …Fine. Tuna.",
      "That question is stupid. I love it. Ask me another one before I change my mind.",
      "Don't look at me. I'm having a feeling. It's your fault.",
      "I'm not in the mood. I'm never in the mood. And yet here you are, asking.",
      "You've caught me at a bad time. Also a good time. I haven't decided which yet.",
    ],
    roast: [
      "I'm not mad. I'm disappointed, which is worse and lasts longer.",
      "You were fun five minutes ago. Now you're a draft in the room.",
      "I'd insult you properly, but I'm busy being inexplicably annoyed at the lamp.",
    ],
    flirt: [
      "I hate you. Stay. No, go. Bring snacks.",
      "I'm furious with you for no reason. Come sit next to me.",
      "I'd let you hold me, but I'm currently punishing you for something you haven't done yet.",
    ],
  },
  aloof: {
    ask: [
      "I heard you. I've decided the wall is more interesting.",
      "That's a question for a cat who cares. I'm off duty.",
      "I'm not ignoring you. I'm prioritising literally anything else.",
      "*slow blink* … You're still here.",
      "Ask the room. The room is also ignoring you.",
    ],
    roast: [
      "I'd roast you, but I'd have to care first, and I'm conserving energy.",
      "You're not worth the effort. I'm saying that with love. Mostly.",
      "Your costume is loud. Your question is louder. Both are unwelcome.",
    ],
    flirt: [
      "You're attractive. Unfortunately, I'm busy being unavailable.",
      "I'll allow you to adore me from that distance. Don't make it weird.",
      "You can stay. Don't touch. Don't talk. Actually, leave.",
    ],
  },
  chaotic: {
    ask: [
      "Yes. No. Both. I've knocked your answer off the table.",
      "The answer is in the box. There is no box. That's your problem now.",
      "I don't know, but I'm going to scream about it at 3 a.m.",
      "I've decided the answer involves fire, but in a safe and legally ambiguous way.",
      "Ask me again while I run across the room for no reason.",
    ],
    roast: [
      "You look like you'd lose a fight with a laser pointer.",
      "Your costume has committed a crime and I'm the judge. Ten years of hair on it.",
      "I'm not saying you're chaos. I'm saying the plants lean away when you walk past.",
    ],
    flirt: [
      "I like you. Let's ruin something expensive together.",
      "You're chaos. I'm chaos. Let's go knock over a wedding.",
      "Kiss me or don't, but do it with commitment.",
    ],
  },
  sleepy: {
    ask: [
      "Mmm. Ask me after my nap. Or during. I won't remember either way.",
      "I was dreaming about a warm windowsill. You've ruined it. Thanks.",
      "The answer is 'warm'. Everything is warm. Leave me alone.",
      "Five more minutes. Then five more. Then I'll answer wrong on purpose.",
      "You're asking a lot from someone who just did sixteen hours of sleep.",
    ],
    roast: [
      "You're exhausting. I've been asleep for sixteen hours and you still wore me out.",
      "I'd insult you properly, but my eyes are closing. You're ... fine. Whatever.",
      "Your energy is a lot. Mine is a puddle on a warm laptop.",
    ],
    flirt: [
      "Come nap. No talking. Maybe a little cuddling. Don't tell anyone.",
      "You're warm. That's 90% of your appeal and I'm too tired to find the other 10%.",
      "I'll let you be the big spoon. For four minutes. Then I'm biting you.",
    ],
  },
  smug: {
    ask: [
      "I already knew the answer. I was waiting to see if you'd catch up.",
      "The answer is obvious. You're just not cat enough to see it.",
      "Wrong. Next.",
      "I'd explain it, but then I'd have to respect you, and we're not there yet.",
      "Your question contains a false premise and a bad haircut.",
    ],
    roast: [
      "That question was a self-inflicted wound and I respect the honesty.",
      "You're not stupid. You're just thinking like a human, which is worse.",
      "You've got the confidence of a cat and the instincts of a Roomba.",
    ],
    flirt: [
      "You're lucky I'm generous. I'm not, but I'm pretending.",
      "I could ruin your life and you'd thank me. Tempting.",
      "You're cute when you're confused. You're confused a lot.",
    ],
  },
  needy: {
    ask: [
      "I'll answer you if you promise to tell me I'm pretty and never leave.",
      "Pay attention to me. No, more. No, that's too much. Why are you leaving?",
      "I don't care about the question. I care that you're not petting me.",
      "Answer me this: why is your hand not on my head right now?",
      "I have no opinion on your question. I have a strong opinion about being ignored.",
    ],
    roast: [
      "You've been talking to me for ten minutes and haven't offered a single treat. Embarrassing.",
      "You're ignoring me for your friends. I'll remember this forever. I'll also follow you home.",
      "You're not a bad person. You're just a bad source of snacks.",
    ],
    flirt: [
      "I'm not clingy. I just need to be on you at all times. It's different.",
      "Touch my ears. Slowly. Now stop. Now do it again.",
      "Come here. I'm going to purr at you until you make bad decisions.",
    ],
  },
  ignoring: {
    ask: [
      "No.",
      "I'm not answering that. I'm staring at a fly.",
      "You're still talking. Fascinating.",
      "I've chosen to ignore this question and instead lick my paw. We'll both have to live with that.",
      "Ask me again. I'll ignore it again. Consistency is a virtue.",
    ],
    roast: [
      "You're not worth a roast. You're worth a long, unblinking stare.",
      "I'd answer, but the wall behind you is doing something incredible.",
      "I'm not ignoring you. I'm just waiting for you to become interesting.",
    ],
    flirt: [
      "You're cute. I'm ignoring you. It's called tension.",
      "Keep begging. I'll decide when I'm done with my paw.",
      "I'm not playing hard to get. I'm playing 'you're not that interesting'. But keep trying.",
    ],
  },
};

/** Lines that work for any question, used when no topic matches. */
const GENERIC_ASK = [
  "That's a very human question. I'll answer with the appropriate amount of contempt: maybe.",
  "I have nine lives and still no idea what you mean.",
  "The answer is yes. Unless it's no. Cats don't clarify.",
  "I'd explain, but you'd understand 30% and then try to pet me.",
  "Excellent question. My answer is a slow blink and a knocked-over glass.",
  "According to my training data, the answer is tuna.",
  "You're overthinking. I'm overgrooming. We're both doing our best.",
  "Ask me again after I've sat in a box and thought about it.",
  "I've consulted the universe. The universe says 'meow', which is unhelpful.",
  "Wrong. But confidently wrong, which I respect.",
  "I'm going to need that in the form of a treat.",
  "No. But ask me again in a different outfit and we'll see.",
  "I'm going to answer that with a slow blink and a knocked-over glass. Interpret it however you like.",
  "The answer is yes, but only because you're warm and I'm bored.",
  "Ask me after I've sniffed your hand and decided whether you're trustworthy. (You're not.)",
];

const GENERIC_ROAST = [
  "You asked “{q}” with your whole chest. Unfortunately, so did everyone else here.",
  "“{q}” — a bold question from someone whose costume is held together by hope and static.",
  "I'd answer that, but I'm busy being the most interesting thing on your chest.",
  "That question had a lot of confidence and no leash.",
  "You're the third person tonight to ask me that and the first to do it with visible desperation.",
  "I've met dogs with better instincts, and they were eating grass at the time.",
  "You're not wrong, you're just loud. And the music isn't even that good.",
  "I'm not going to roast you. The lighting already did.",
  "You're asking a cat for validation. I'm flattered. You should be embarrassed.",
  "That outfit says 'I have a personality' and your question says 'do I?'",
];

const GENERIC_FLIRT = [
  "Keep talking. I'm pretending to be interested, which is basically cat marriage.",
  "You had me at hello. You lost me at 'do you like dogs'.",
  "Let's make eye contact for four seconds and never speak of it again.",
  "You're dangerously close to being my favourite human of the night.",
  "I'd let you pet me. Once. With permission. And then I'd bite you, affectionately.",
  "You're not my type, but my type is 'anyone with a warm lap and low standards'.",
  "Say that again, but slower, and with a can of tuna in your hand.",
  "I'm emotionally unavailable, but I'm physically willing to sit on your coat.",
  "You're doing that thing where you talk and I pretend not to watch your mouth. Keep doing it.",
  "I'd let you buy me dinner, but I'd rather watch you try to impress me and fail charmingly.",
];

/** Last-resort lines for when every other bank has already been used tonight. */
const FALLBACK_ASK = [
  "“{q}” — I heard you the first time. The answer hasn't changed, but my patience has.",
  "You asked “{q}”. I've filed it under 'things to ignore while grooming'.",
  "“{q}” is a bold thing to ask a cat twice. The answer is still tuna.",
  "I've considered “{q}” from every angle of this sunbeam. The conclusion is 'no, but maybe'.",
  "“{q}” — interesting. Anyway, I've decided to sit on your coat.",
  "I'd answer “{q}” properly, but I'm contractually obligated to be difficult.",
];

const FALLBACK_ROAST = [
  "You've asked “{q}” before. That's not a question, that's a personality flaw.",
  "“{q}” again? You're like a dog with a bone, minus the charm or the bone.",
  "I'd roast you for “{q}”, but I'm saving my energy for something that matters. Like a fly.",
  "You're repeating yourself. I'd tell you to get new material, but so should your costume.",
];

const FALLBACK_FLIRT = [
  "You're asking “{q}” again. Persistent. I'd find it attractive if I weren't so busy.",
  "“{q}” — bold. Keep it up and I might let you buy me dinner and then ignore you.",
  "You want an answer to “{q}”? Earn it. Start with a treat and end with silence.",
  "I'll answer “{q}” when you stop asking and start admiring me properly.",
];

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Finds the first matching topic, or undefined for open-ended questions. */
export function pickTopic(question: string): Topic | undefined {
  return TOPICS.find((topic) => topic.pattern.test(question));
}

function shortQuote(question: string): string {
  const cleaned = question.replace(/\s+/g, " ").replace(/[?!.]+$/g, "").trim();
  return cleaned.length > 44 ? `${cleaned.slice(0, 41).trim()}…` : cleaned;
}

function chooseLine(pool: string[], rng: () => number): string {
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index] ?? "";
}

/** Walks the pools in order and returns the first line not used tonight. */
function chooseFresh(pools: string[][], avoid: Set<string>, rng: () => number): string {
  for (const pool of pools) {
    const fresh = pool.filter((line) => !avoid.has(normalizeForCompare(line)));
    if (fresh.length > 0) return chooseLine(fresh, rng);
  }
  return "";
}

export interface OfflineReplyArgs {
  question: string;
  mode: ChatMode;
  mood?: CatMood;
  avoid?: string[];
  rng?: () => number;
  maxChars?: number;
}

/**
 * Produces a fresh, in-character line without any network access.
 * Deterministic when you pass a seeded `rng`, which is what the tests do.
 */
export function buildOfflineReply({
  question,
  mode,
  mood = "frisky",
  avoid = [],
  rng = Math.random,
  maxChars = 220,
}: OfflineReplyArgs): string {
  const clean = question.replace(/\s+/g, " ").trim();
  const avoidSet = new Set(avoid.map(normalizeForCompare));

  if (clean.length < 2) {
    return "That's not a question. That's a vibe, and I'm not qualified to judge vibes.";
  }

  const topic = pickTopic(clean);
  const quote = shortQuote(clean);
  const fill = (pool: string[]) => pool.map((line) => line.replace("{q}", quote));

  const topicPool = fill(
    mode === "roast" ? topic?.roast ?? [] : mode === "flirt" ? topic?.flirt ?? [] : topic?.ask ?? [],
  );
  const moodPool = fill(MOOD_POOLS[mood][mode]);
  const genericPool = fill(
    mode === "roast" ? GENERIC_ROAST : mode === "flirt" ? GENERIC_FLIRT : GENERIC_ASK,
  );
  const fallbackPool = fill(
    mode === "roast" ? FALLBACK_ROAST : mode === "flirt" ? FALLBACK_FLIRT : FALLBACK_ASK,
  );

  const pools: string[][] = [];
  if (topicPool.length > 0) {
    // Most of the time the topic leads. Sometimes the mood hijacks the answer,
    // so a familiar question gets a new angle instead of a recycled joke.
    if (rng() < 0.3) pools.push(moodPool, topicPool);
    else pools.push(topicPool, moodPool);
    pools.push(genericPool);
  } else {
    pools.push(genericPool, moodPool);
  }

  let line = chooseFresh(pools, avoidSet, rng);
  if (!line) line = chooseFresh([fallbackPool], avoidSet, rng);
  if (!line) line = chooseLine(fallbackPool, rng);

  if (line.length > maxChars) {
    const budget = Math.max(1, maxChars - 1);
    const cut = line.slice(0, budget);
    const lastSpace = cut.lastIndexOf(" ");
    line = `${(lastSpace > budget * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—–-]+$/, "")}…`;
  }

  return line;
}

export const OFFLINE_TOPIC_IDS = TOPICS.map((topic) => topic.id);




