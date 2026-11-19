import { resolveLanguage, type ArchFacet } from '@shared/types'
import { useStore } from '../store'

export type Lang = 'en' | 'de'

/**
 * Every string the learning journey shows, in one typed table per language.
 *
 * Why an interface instead of a key→string map with fallbacks: TypeScript then
 * refuses a language that forgot a string, so a half-translated journey can't
 * ship. Only the lesson path is covered — the rest of the app's chrome
 * (settings, arcade, review) is still English.
 */
export interface Strings {
  // ── generic ───────────────────────────────────────────────────────────────
  continue: string
  check: string
  grading: string
  skip: string
  cantTell: string
  tryAgain: string
  back: string
  close: string

  // ── lesson chrome ─────────────────────────────────────────────────────────
  lessonN: (n: number) => string
  lesson: string
  quitLesson: string
  inARow: (n: number) => string
  previousMistake: string
  mistakesToRevisit: (n: number) => string
  findEveryPair: string
  comesBackLater: string
  correctAnswer: string
  strongAnswer: string
  praise: string[]
  nowYouKnow: string
  notQuite: string
  hereIsAnswer: string
  couldNotGrade: string
  buildingLesson: string
  couldNotBuildLesson: string
  nothingToPractice: string
  noOpenMistakes: string
  backToPath: string
  dontGo: string
  loseProgress: string
  keepLearning: string
  endLesson: string

  // ── results ───────────────────────────────────────────────────────────────
  lessonComplete: string
  perfectLesson: string
  practiceComplete: string
  totalXp: string
  accuracy: string
  accAmazing: string
  accGreat: string
  accGood: string
  speedy: string
  time: string
  coinsEarned: (n: number) => string
  streakStarted: (n: number) => string
  streakDays: (n: number) => string
  dailyGoalReached: string
  keepGoing: string
  bonusWriteCode: string
  huntTheBugs: string
  issuesToFlag: (n: number) => string

  // ── exercise screens ──────────────────────────────────────────────────────
  eyebrowIdea: string
  eyebrowSimplified: string
  eyebrowPredict: string
  eyebrowFindIt: string
  eyebrowMatch: string
  eyebrowOrder: string
  eyebrowFill: string
  eyebrowValue: string
  eyebrowCheck: string
  eyebrowOwnWords: string
  eyebrowInsight: string
  eyebrowWarmup: string
  eyebrowBigPicture: string
  eyebrowSize: string

  goodToKnow: string
  termsHeading: string
  analogyLabel: string
  afterThisLesson: string
  simplifiedNote: string
  thenTheRealCode: string
  blocksToRead: (n: number) => string
  predictFirstBullet: string
  questionsToCheck: (n: number) => string

  predictFallback: string
  tapLinePrompt: string
  tapLineHint: string
  tapLinePicked: (n: number) => string
  matchTermsPrompt: string
  matchNamesPrompt: string
  matchedCount: (done: number, total: number) => string
  orderPrompt: (name: string) => string
  orderHint: string
  completeInsight: string
  valuePrompt: (name: string) => string
  valueEarlier: (label: string, value: string) => string
  explainPlaceholder: string
  explainHint: (mod: string) => string
  hoverHint: string
  storyWhat: string
  storyFits: string
  storyCalledBy: string
  storyGotcha: string
  showMore: string
  showLess: string
  changeAdded: string
  changeModified: string
  changeRemoved: string
  changeContext: string

  // ── warm-up ───────────────────────────────────────────────────────────────
  warmupTitle: string
  archFileBucket: (lo: number, hi: number) => string
  archScaleDetail: (files: number, add: number, del: number) => string
  archHotspotsTitle: string
  archHotspotsPrompt: string
  archOrderTitle: string
  archOrderBack: (label: string) => string
  archOrderPlain: string
  facets: Record<ArchFacet, string>
  warmupBody: string
  scalePrompt: string
  scaleExplanation: (detail: string) => string
  whyLabel: string

  // ── the path ──────────────────────────────────────────────────────────────
  warmupNode: string
  warmupNodeSub: string
  warmupNodeMeta: string
  finaleVerdict: string
  finaleVerdictSub: string
  finaleTopic: string
  finaleTopicSub: string
  buildingCourse: string
  buildingCourseSub: string
  couldNotBuild: string
  bigPictureBtn: string
  yourQuestion: string
  preparing: string
  needsRetry: string
  failedToPrepare: string
  filesCount: (n: number) => string
  blocksCount: (n: number) => string
  startBtn: string
  claimBtn: string
  practiceAgain: string
  jumpAhead: string
  lockedHint: string
  finishToUnlock: (n: number, topic: boolean) => string
  mintVerdict: string
  seeBigPicture: string
  streakUnit: (n: number) => string
  streakSafe: string
  streakKeep: string
  streakStart: string
  dailyGoal: string
  xpOf: (a: number, b: number) => string
  practiceTitle: string
  practiceOpen: (n: number) => string
  practiceNone: string
  practiceBtn: string
  verdictTitle: string
  verdictReady: string
  verdictProgress: (done: number, total: number) => string
  moreWays: string
  railBugHunt: string
  railBugHuntSub: string
  railBoss: string
  railBossSub: string
  railBlast: string
  railBlastSub: string
  railFlow: string
  railFlowSub: string
  railArcade: string
  railArcadeSub: string
}

const en: Strings = {
  continue: 'Continue',
  check: 'Check',
  grading: 'Grading…',
  skip: 'Skip',
  cantTell: "Can't tell",
  tryAgain: 'Try again',
  back: 'Back',
  close: 'Close',

  lessonN: (n) => `Lesson ${n}`,
  lesson: 'Lesson',
  quitLesson: 'Quit lesson (Esc)',
  inARow: (n) => `🔥 ${n} in a row`,
  previousMistake: '↺ Previous mistake',
  mistakesToRevisit: (n) => `${n} mistake${n === 1 ? '' : 's'} to revisit`,
  findEveryPair: 'Find every pair to continue.',
  comesBackLater: 'This one will come back before the lesson ends.',
  correctAnswer: 'Correct answer: ',
  strongAnswer: 'A strong answer: ',
  praise: ['Nice!', 'Correct!', 'You got it!', 'Spot on!', 'Exactly.', 'Great read!'],
  nowYouKnow: 'Now you know',
  notQuite: 'Not quite',
  hereIsAnswer: "Here's a strong answer",
  couldNotGrade: "Couldn't grade that — here's a strong answer",
  buildingLesson: 'Reading the real code to build your lesson…',
  couldNotBuildLesson: "Couldn't build this lesson",
  nothingToPractice: 'Nothing to practice',
  noOpenMistakes: 'No open mistakes in this walkthrough.',
  backToPath: 'Back to the path',
  dontGo: "Wait, don't go!",
  loseProgress: "You'll lose your progress in this lesson if you quit now.",
  keepLearning: 'Keep learning',
  endLesson: 'End lesson',

  lessonComplete: 'Lesson complete!',
  perfectLesson: 'Perfect lesson!',
  practiceComplete: 'Practice complete!',
  totalXp: 'Total XP',
  accuracy: 'Accuracy',
  accAmazing: 'Amazing',
  accGreat: 'Great',
  accGood: 'Good',
  speedy: 'Speedy',
  time: 'Time',
  coinsEarned: (n) => `+${n} 🪙 coins`,
  streakStarted: (n) => `🔥 ${n} day streak started!`,
  streakDays: (n) => `🔥 ${n} day streak!`,
  dailyGoalReached: '⚡ Daily goal reached',
  keepGoing: 'Keep going',
  bonusWriteCode: 'Bonus: write the code',
  huntTheBugs: 'Review it: hunt the bugs',
  issuesToFlag: (n) => `${n} issue${n === 1 ? '' : 's'} a reviewer would flag`,

  eyebrowIdea: '✦ The idea',
  eyebrowSimplified: '◻ Simplified first',
  eyebrowPredict: 'Predict',
  eyebrowFindIt: 'Find it',
  eyebrowMatch: 'Match',
  eyebrowOrder: 'Order',
  eyebrowFill: 'Fill the gap',
  eyebrowValue: 'Predict the value',
  eyebrowCheck: 'Check yourself',
  eyebrowOwnWords: 'In your own words',
  eyebrowInsight: '💡 Insight',
  eyebrowWarmup: '🛰 Warm-up',
  eyebrowBigPicture: '✦ The big picture',
  eyebrowSize: '📐 Size',

  goodToKnow: 'Worth knowing',
  termsHeading: 'Words you need',
  analogyLabel: 'Think of it like',
  afterThisLesson: 'In this lesson',
  simplifiedNote: 'Simplified on purpose — not the real code yet.',
  thenTheRealCode: 'The real code comes next.',
  blocksToRead: (n) => `${n} code block${n === 1 ? '' : 's'} to read`,
  predictFirstBullet: 'You guess first — the explanation comes after',
  questionsToCheck: (n) => `${n} question${n === 1 ? '' : 's'} to check yourself`,

  predictFallback: 'Read the code first. What is this block doing?',
  tapLinePrompt: 'Tap the line where this happens',
  tapLineHint: 'Tap a line in the code.',
  tapLinePicked: (n) => `Line ${n} selected — tap another to change it.`,
  matchTermsPrompt: 'Match each word to what it means',
  matchNamesPrompt: 'Match each name to what it is',
  matchedCount: (done, total) => `${done}/${total} matched`,
  orderPrompt: (name) => `Put the steps in the order ${name} flows through them`,
  orderHint: 'Tap the cards in order. Tap a placed card to send it back.',
  completeInsight: 'Complete the insight',
  valuePrompt: (name) => `What does ${name} hold at the highlighted line?`,
  valueEarlier: (label, value) => `Earlier — ${label}: ${value}`,
  explainPlaceholder: "Explain it the way you'd tell a teammate…",
  explainHint: (mod) => `Graded on understanding, not wording. ${mod}+Enter to check.`,
  hoverHint: 'Hover an underlined name to see what it is.',
  storyWhat: 'What it does',
  storyFits: 'How it fits',
  storyCalledBy: 'Who calls it',
  storyGotcha: '⚠ Watch out',
  showMore: 'More about this block',
  showLess: 'Hide the details',
  changeAdded: 'Added',
  changeModified: 'Changed',
  changeRemoved: 'Removed',
  changeContext: 'Explore',

  warmupTitle: 'First, guess.',
  archFileBucket: (lo, hi) => (hi === Infinity ? `${lo}+ files` : lo === hi ? `${lo} file` : `${lo}–${hi} files`),
  archScaleDetail: (files, add, del) => `${files} ${files === 1 ? 'file' : 'files'} · +${add} −${del}`,
  archHotspotsTitle: '🔥 Where does the weight land?',
  archHotspotsPrompt: 'Rank these files by how much of the change lives in them — heaviest first.',
  archOrderTitle: '🔀 What happens in what order?',
  archOrderBack: (label) => `Back in order: ${label}.`,
  archOrderPlain: 'Put the main flow back in order.',
  facets: { shape: 'Shape', data: 'Data', flow: 'Flow', boundary: 'Boundary', risk: 'Risk' },
  warmupBody:
    "You haven't read a line yet — perfect. Call the shape of this change now. Being wrong here is the point: it's exactly what the lessons will fix.",
  scalePrompt: 'How much code does this change touch?',
  scaleExplanation: (detail) => `It touches ${detail}.`,
  whyLabel: 'Why',

  warmupNode: 'Warm-up',
  warmupNodeSub: 'Guess the shape before you read',
  warmupNodeMeta: 'A few guesses, then the big picture',
  finaleVerdict: 'Your verdict',
  finaleVerdictSub: 'Approve or request changes — earned, not clicked',
  finaleTopic: 'Journey complete',
  finaleTopicSub: 'You answered your question',
  buildingCourse: 'Building your course…',
  buildingCourseSub: 'The agent is reading the whole change to plan your lessons.',
  couldNotBuild: "Couldn't build the walkthrough",
  bigPictureBtn: '📖 Big picture',
  yourQuestion: '🧭 Your question',
  preparing: 'preparing…',
  needsRetry: '⚠ needs a retry',
  failedToPrepare: 'failed to prepare — start to retry',
  filesCount: (n) => `${n} file${n === 1 ? '' : 's'}`,
  blocksCount: (n) => `${n} code block${n === 1 ? '' : 's'}`,
  startBtn: 'Start',
  claimBtn: 'Claim',
  practiceAgain: 'Practice again',
  jumpAhead: 'Jump ahead',
  lockedHint: 'Finish the lessons before this one to unlock it — or jump ahead.',
  finishToUnlock: (n, topic) =>
    `Finish ${n} more lesson${n === 1 ? '' : 's'} to ${topic ? 'complete the journey' : 'unlock your verdict'}.`,
  mintVerdict: 'Mint your verdict',
  seeBigPicture: 'See the big picture',
  streakUnit: (n) => `${n} day${n === 1 ? '' : 's'}`,
  streakSafe: 'Streak safe today',
  streakKeep: 'Finish a lesson to keep it',
  streakStart: 'Finish a lesson to start a streak',
  dailyGoal: '⚡ Daily goal',
  xpOf: (a, b) => `${a}/${b} XP`,
  practiceTitle: '🎯 Practice',
  practiceOpen: (n) => `${n} question${n === 1 ? '' : 's'} you missed. Get them right to make them stick.`,
  practiceNone: 'Questions you miss land here for a second try.',
  practiceBtn: 'Practice mistakes',
  verdictTitle: '🏁 Your verdict',
  verdictReady: 'You understand the change. Spend your coins to mint an Approve / Request-changes review.',
  verdictProgress: (done, total) => `Finish every lesson to unlock it — ${done}/${total} done.`,
  moreWays: 'More ways to learn',
  railBugHunt: 'Bug Hunt',
  railBugHuntSub: 'Spot what a reviewer would flag',
  railBoss: 'Boss Fight',
  railBossSub: 'Rapid recall across every lesson',
  railBlast: 'Blast radius',
  railBlastSub: 'Map of everything that changed',
  railFlow: 'Data flow',
  railFlowSub: 'Watch values move through it',
  railArcade: 'Arcade',
  railArcadeSub: 'Mini-games, shop and quests'
}

const de: Strings = {
  continue: 'Weiter',
  check: 'Prüfen',
  grading: 'Wird bewertet…',
  skip: 'Überspringen',
  cantTell: 'Keine Ahnung',
  tryAgain: 'Nochmal versuchen',
  back: 'Zurück',
  close: 'Schließen',

  lessonN: (n) => `Lektion ${n}`,
  lesson: 'Lektion',
  quitLesson: 'Lektion beenden (Esc)',
  inARow: (n) => `🔥 ${n} richtig in Folge`,
  previousMistake: '↺ Vorheriger Fehler',
  mistakesToRevisit: (n) => `${n} Fehler kommen nochmal`,
  findEveryPair: 'Finde alle Paare, um weiterzumachen.',
  comesBackLater: 'Diese Frage kommt vor Ende der Lektion nochmal.',
  correctAnswer: 'Richtige Antwort: ',
  strongAnswer: 'So klingt eine gute Antwort: ',
  praise: ['Stark!', 'Richtig!', 'Genau!', 'Sitzt!', 'Perfekt.', 'Gut gelesen!'],
  nowYouKnow: 'Jetzt weißt du es',
  notQuite: 'Nicht ganz',
  hereIsAnswer: 'So klingt eine gute Antwort',
  couldNotGrade: 'Konnte das nicht bewerten — so klingt eine gute Antwort',
  buildingLesson: 'Der echte Code wird gelesen, um deine Lektion zu bauen…',
  couldNotBuildLesson: 'Diese Lektion konnte nicht gebaut werden',
  nothingToPractice: 'Nichts zu üben',
  noOpenMistakes: 'In diesem Durchgang sind keine Fehler offen.',
  backToPath: 'Zurück zum Pfad',
  dontGo: 'Warte, bleib dran!',
  loseProgress: 'Wenn du jetzt gehst, ist der Fortschritt in dieser Lektion weg.',
  keepLearning: 'Weiterlernen',
  endLesson: 'Lektion abbrechen',

  lessonComplete: 'Lektion geschafft!',
  perfectLesson: 'Perfekte Lektion!',
  practiceComplete: 'Übung geschafft!',
  totalXp: 'XP gesamt',
  accuracy: 'Treffer',
  accAmazing: 'Überragend',
  accGreat: 'Sehr gut',
  accGood: 'Gut',
  speedy: 'Schnell',
  time: 'Zeit',
  coinsEarned: (n) => `+${n} 🪙 Münzen`,
  streakStarted: (n) => `🔥 ${n}-Tage-Serie gestartet!`,
  streakDays: (n) => `🔥 ${n} Tage Serie!`,
  dailyGoalReached: '⚡ Tagesziel erreicht',
  keepGoing: 'Weitermachen',
  bonusWriteCode: 'Bonus: schreib den Code',
  huntTheBugs: 'Review üben: finde die Bugs',
  issuesToFlag: (n) => `${n} Stelle${n === 1 ? '' : 'n'}, die ein Reviewer ansprechen würde`,

  eyebrowIdea: '✦ Die Idee',
  eyebrowSimplified: '◻ Erst vereinfacht',
  eyebrowPredict: 'Rate mal',
  eyebrowFindIt: 'Finde es',
  eyebrowMatch: 'Zuordnen',
  eyebrowOrder: 'Reihenfolge',
  eyebrowFill: 'Lücke füllen',
  eyebrowValue: 'Wert vorhersagen',
  eyebrowCheck: 'Selbsttest',
  eyebrowOwnWords: 'In eigenen Worten',
  eyebrowInsight: '💡 Erkenntnis',
  eyebrowWarmup: '🛰 Aufwärmen',
  eyebrowBigPicture: '✦ Das große Bild',
  eyebrowSize: '📐 Größe',

  goodToKnow: 'Gut zu wissen',
  termsHeading: 'Diese Wörter brauchst du',
  analogyLabel: 'Stell dir vor',
  afterThisLesson: 'In dieser Lektion',
  simplifiedNote: 'Absichtlich vereinfacht — noch nicht der echte Code.',
  thenTheRealCode: 'Der echte Code kommt als Nächstes.',
  blocksToRead: (n) => `${n} ${n === 1 ? 'Codeblock' : 'Codeblöcke'} zu lesen`,
  predictFirstBullet: 'Du rätst zuerst — die Erklärung kommt danach',
  questionsToCheck: (n) => `${n} ${n === 1 ? 'Frage' : 'Fragen'} zum Selbsttest`,

  predictFallback: 'Lies erst den Code. Was macht dieser Block?',
  tapLinePrompt: 'Tippe die Zeile an, in der das passiert',
  tapLineHint: 'Tippe eine Zeile im Code an.',
  tapLinePicked: (n) => `Zeile ${n} gewählt — tippe eine andere, um zu wechseln.`,
  matchTermsPrompt: 'Ordne jedem Wort seine Bedeutung zu',
  matchNamesPrompt: 'Ordne jedem Namen zu, was er ist',
  matchedCount: (done, total) => `${done}/${total} zugeordnet`,
  orderPrompt: (name) => `Bringe die Schritte in die Reihenfolge, in der ${name} sie durchläuft`,
  orderHint: 'Tippe die Karten in der richtigen Reihenfolge an. Eine gesetzte Karte geht per Tipp zurück.',
  completeInsight: 'Vervollständige die Erkenntnis',
  valuePrompt: (name) => `Was steht in ${name} an der markierten Zeile?`,
  valueEarlier: (label, value) => `Vorher — ${label}: ${value}`,
  explainPlaceholder: 'Erklär es so, wie du es einem Kollegen sagen würdest…',
  explainHint: (mod) => `Bewertet wird das Verständnis, nicht die Formulierung. ${mod}+Enter zum Prüfen.`,
  hoverHint: 'Fahre über einen unterstrichenen Namen, um zu sehen, was er ist.',
  storyWhat: 'Was es macht',
  storyFits: 'Wie es hineinpasst',
  storyCalledBy: 'Wer es aufruft',
  storyGotcha: '⚠ Achtung',
  showMore: 'Mehr zu diesem Block',
  showLess: 'Details ausblenden',
  changeAdded: 'Neu',
  changeModified: 'Geändert',
  changeRemoved: 'Entfernt',
  changeContext: 'Erkunden',

  warmupTitle: 'Erst mal raten.',
  archFileBucket: (lo, hi) => (hi === Infinity ? `${lo}+ Dateien` : lo === hi ? `${lo} Datei` : `${lo}–${hi} Dateien`),
  archScaleDetail: (files, add, del) => `${files} ${files === 1 ? 'Datei' : 'Dateien'} · +${add} −${del}`,
  archHotspotsTitle: '🔥 Wo liegt das Gewicht?',
  archHotspotsPrompt: 'Sortiere die Dateien danach, wie viel von der Änderung in ihnen steckt — die dickste zuerst.',
  archOrderTitle: '🔀 Was passiert in welcher Reihenfolge?',
  archOrderBack: (label) => `Wieder in die richtige Reihenfolge: ${label}.`,
  archOrderPlain: 'Bringe den Hauptablauf wieder in die richtige Reihenfolge.',
  facets: { shape: 'Aufbau', data: 'Daten', flow: 'Ablauf', boundary: 'Zuständigkeit', risk: 'Risiko' },
  warmupBody:
    'Du hast noch keine Zeile gelesen — perfekt. Schätze jetzt, wie diese Änderung aussieht. Falsch zu liegen ist genau der Punkt: das ist es, was die Lektionen gerade ziehen.',
  scalePrompt: 'Wie viel Code berührt diese Änderung?',
  scaleExplanation: (detail) => `Sie berührt ${detail}.`,
  whyLabel: 'Warum',

  warmupNode: 'Aufwärmen',
  warmupNodeSub: 'Rate die Form, bevor du liest',
  warmupNodeMeta: 'Ein paar Schätzungen, dann das große Bild',
  finaleVerdict: 'Dein Fazit',
  finaleVerdictSub: 'Freigeben oder Änderungen anfordern — verdient, nicht geklickt',
  finaleTopic: 'Reise abgeschlossen',
  finaleTopicSub: 'Du hast deine Frage beantwortet',
  buildingCourse: 'Dein Kurs wird gebaut…',
  buildingCourseSub: 'Der Agent liest die ganze Änderung, um deine Lektionen zu planen.',
  couldNotBuild: 'Der Rundgang konnte nicht gebaut werden',
  bigPictureBtn: '📖 Großes Bild',
  yourQuestion: '🧭 Deine Frage',
  preparing: 'wird vorbereitet…',
  needsRetry: '⚠ nochmal versuchen',
  failedToPrepare: 'Vorbereitung fehlgeschlagen — starten, um es erneut zu versuchen',
  filesCount: (n) => `${n} Datei${n === 1 ? '' : 'en'}`,
  blocksCount: (n) => `${n} ${n === 1 ? 'Codeblock' : 'Codeblöcke'}`,
  startBtn: 'Start',
  claimBtn: 'Einlösen',
  practiceAgain: 'Nochmal üben',
  jumpAhead: 'Vorspringen',
  lockedHint: 'Mach erst die Lektionen davor — oder spring direkt vor.',
  finishToUnlock: (n, topic) =>
    `Noch ${n} Lektion${n === 1 ? '' : 'en'}, dann ${topic ? 'ist die Reise komplett' : 'ist dein Fazit frei'}.`,
  mintVerdict: 'Fazit erstellen',
  seeBigPicture: 'Großes Bild ansehen',
  streakUnit: (n) => `${n} Tag${n === 1 ? '' : 'e'}`,
  streakSafe: 'Serie heute gesichert',
  streakKeep: 'Mach eine Lektion, um sie zu halten',
  streakStart: 'Mach eine Lektion, um eine Serie zu starten',
  dailyGoal: '⚡ Tagesziel',
  xpOf: (a, b) => `${a}/${b} XP`,
  practiceTitle: '🎯 Üben',
  practiceOpen: (n) => `${n} Frage${n === 1 ? '' : 'n'} lagen falsch. Hol sie dir, damit sie sitzen.`,
  practiceNone: 'Fragen, die du verhaust, landen hier für den zweiten Versuch.',
  practiceBtn: 'Fehler üben',
  verdictTitle: '🏁 Dein Fazit',
  verdictReady: 'Du verstehst die Änderung. Gib deine Münzen aus und erstelle dein Review.',
  verdictProgress: (done, total) => `Mach alle Lektionen, um es freizuschalten — ${done}/${total} erledigt.`,
  moreWays: 'Mehr Wege zu lernen',
  railBugHunt: 'Bug-Jagd',
  railBugHuntSub: 'Finde, was ein Reviewer ansprechen würde',
  railBoss: 'Bossfight',
  railBossSub: 'Schnelles Abfragen quer durch alle Lektionen',
  railBlast: 'Änderungskarte',
  railBlastSub: 'Übersicht über alles, was sich geändert hat',
  railFlow: 'Datenfluss',
  railFlowSub: 'Sieh zu, wie Werte durchlaufen',
  railArcade: 'Arcade',
  railArcadeSub: 'Minispiele, Shop und Quests'
}

export const STRINGS: Record<Lang, Strings> = { en, de }

/** The language the journey is currently written in. */
export function useLang(): Lang {
  const language = useStore((s) => s.settings?.language)
  return resolveLanguage(language, navigator.language)
}

/** The strings for the current language. */
export function useStrings(): Strings {
  return STRINGS[useLang()]
}
