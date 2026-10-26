'use strict';

// Optional public configuration. No server or private credentials are used.
const SURVEY_URL = '';
const STORAGE_KEY = 'commonground-static-v1';
const img1 = './assets/img1.jpg', img2 = './assets/img2.jpg', img3 = './assets/img3.jpg';
const img6 = './assets/img6.jpg', img7 = './assets/img7.jpg', img8 = './assets/img8.jpg', img9 = './assets/img9.jpg';
const root = document.getElementById('root');
let events = [], renderPending = false;
let state = {
  studyId: new URLSearchParams(location.search).get('studyId') || `demo-${Date.now()}`,
  phase: 'portal', videoCompleted: false, quizAnswers: [], retryAnswers: [],
  firstScore: null, correctedScore: null, rolePlays: [], feedbackConfirmed: false,
  completionStatus: null, achievementPoints: 0, badgeEarned: false, soundEnabled: true,
  pages: {}, returnAttempts: []
};
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved && saved.pages && Array.isArray(saved.quizAnswers)) state = {...state, ...saved};
} catch (_) { /* A blocked store is reported on the first attempted save. */ }

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (_) {
    alert('Your browser could not save progress. Please allow local storage or free up space, then retry. You will remain on this step.');
    throw new Error('Local progress could not be saved');
  }
}
function commit(update) {
  const previous = structuredClone(state);
  Object.assign(state, update);
  try { persist(); } catch (error) { state = previous; throw error; }
  scheduleRender();
}
const learning = new Proxy({}, {get(_, key) {
  if (key in actions) return actions[key];
  return state[key];
}});
const actions = {
  setPhase: phase => commit({phase}),
  setVideoCompleted: () => commit({videoCompleted: true}),
  setSoundEnabled: soundEnabled => commit({soundEnabled}),
  submitQuizAnswer(idx, selectedOption, isCorrect, isRetry = false) {
    const key = isRetry ? 'retryAnswers' : 'quizAnswers';
    if (state[key].some(a => a.questionIndex === idx)) return;
    commit({[key]: [...state[key], {questionIndex: idx, selectedOption, isCorrect, isRetry, submittedAt: new Date().toISOString()}]});
    if (state.soundEnabled) playTone();
  },
  computeFirstScore() {
    const firstScore = state.quizAnswers.filter(a => a.isCorrect).length * 12.5;
    commit({firstScore}); return firstScore;
  },
  computeCorrectedScore() {
    const correctedScore = (state.quizAnswers.filter(a => a.isCorrect).length + state.retryAnswers.filter(a => a.isCorrect).length) * 12.5;
    commit({correctedScore}); return correctedScore;
  },
  addRolePlayRound(round) {
    if (!state.rolePlays.some(r => r.roundNumber === round.roundNumber))
      commit({rolePlays: [...state.rolePlays, round]});
  },
  confirmFeedback: () => commit({feedbackConfirmed: true}),
  setCompletionStatus: completionStatus => commit({completionStatus}),
  awardPoints() { if (!state.badgeEarned) commit({achievementPoints: 100, badgeEarned: true}); }
};
function pageValue(page, key, initial) {
  const data = state.pages[page] ||= {};
  if (!(key in data)) data[key] = initial();
  return data[key];
}
function changePage(page, key, value) {
  const data = state.pages[page] ||= {};
  const previous = data[key];
  data[key] = typeof value === 'function' ? value(previous) : value;
  try { persist(); } catch (error) { data[key] = previous; throw error; }
  scheduleRender();
}
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  queueMicrotask(() => { renderPending = false; render(); });
}
function currentPath() { return location.hash.startsWith('#/') ? location.hash.slice(1).split('?')[0] : '/'; }
function go(path) {
  if (state.pages.VideoPage) state.pages.VideoPage.playing = false;
  if (path === '/portal') {
    for (const page of Object.values(state.pages)) page.showExitDialog = false;
  }
  if (path === '/course/intro' && state.completionStatus) path = '/course/completion';
  if (path.startsWith('/course/results') && state.correctedScore !== null) path = '/course/results?mode=retry';
  persist();
  location.hash = path;
  scheduleRender();
  window.scrollTo(0, 0);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
const fragment = Symbol('fragment');
const unitless = new Set(['opacity','fontWeight','lineHeight','zIndex','flex','flexGrow','flexShrink','order']);
// Serialize directly to HTML, then attach native DOM listeners. No virtual DOM or framework.
function html(tag, attributes, ...children) {
  const p = attributes || {};
  if (typeof tag === 'function') return tag(p);
  const content = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false && c !== true)
    .map(c => c && typeof c === 'object' && 'markup' in c ? c.markup : escapeHTML(c)).join('');
  if (tag === fragment) return {markup: content};
  let attrs = '', handlers = {};
  for (let [key, value] of Object.entries(p)) {
    if (key === 'key' || key === 'ref' || value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) { handlers[key.slice(2).toLowerCase()] = value; continue; }
    if (key === 'style') {
      value = Object.entries(value).map(([k,v]) => `${k.replace(/[A-Z]/g, m=>'-'+m.toLowerCase())}:${typeof v === 'number' && v !== 0 && !unitless.has(k) ? v+'px' : v}`).join(';');
    }
    key = ({className:'class',htmlFor:'for',strokeWidth:'stroke-width',strokeLinecap:'stroke-linecap',strokeLinejoin:'stroke-linejoin'})[key] || key;
    if (key === 'value' && tag === 'textarea') continue;
    if (value === true) { attrs += ` ${key}`; continue; }
    attrs += ` ${key}="${escapeHTML(value)}"`;
  }
  if (Object.keys(handlers).length) { const id = events.push(handlers) - 1; attrs += ` data-event="${id}"`; }
  const voidTags = ['input','img','br','hr','meta','link','source','wbr'];
  return {markup: `<${tag}${attrs}>${tag === 'textarea' ? escapeHTML(p.value || '') : content}${voidTags.includes(tag) ? '' : `</${tag}>`}`};
}
function render() {
  const focused = document.activeElement;
  const activeId = focused?.id;
  const isTextarea = focused?.tagName === 'TEXTAREA';
  const start = focused?.selectionStart, end = focused?.selectionEnd;
  events = [];
  let path = currentPath();
  // Hash routes work under GitHub Pages project paths, without rewrite rules.
  if (path.startsWith('/course/') && path !== '/course/intro') {
    let allowed = path;
    if (state.completionStatus && state.completionStatus !== 'interrupted') allowed = '/course/completion';
    else if (path !== '/course/video' && !state.videoCompleted) allowed = '/course/video';
    else if (['/course/results','/course/retry','/course/roleplay','/course/feedback','/course/completion'].includes(path) && state.firstScore === null) allowed = '/course/quiz';
    else if (path === '/course/retry' && (state.correctedScore !== null || state.firstScore >= 85)) allowed = '/course/results';
    else if (['/course/roleplay','/course/feedback','/course/completion'].includes(path) && state.firstScore < 85 && state.correctedScore === null) allowed = '/course/results';
    else if (['/course/feedback','/course/completion'].includes(path) && state.rolePlays.length < 3) allowed = '/course/roleplay';
    else if (path === '/course/completion' && !state.feedbackConfirmed && state.completionStatus !== 'interrupted') allowed = '/course/feedback';
    if (allowed !== path) { location.replace('#' + allowed); path = allowed; }
  }
  const pages = {'/':LandingPage,'/portal':PortalPage,'/course/intro':CourseIntroPage,
    '/course/video':VideoPage,'/course/quiz':QuizPage,'/course/retry':()=>QuizPage({isRetry:true}),
    '/course/results':ResultsPage,'/course/roleplay':RolePlayPage,'/course/feedback':FeedbackPage,
    '/course/completion':CompletionPage};
  root.innerHTML = (pages[path] || LandingPage)({}).markup;
  root.querySelectorAll('[data-event]').forEach(node => {
    for (const [event, handler] of Object.entries(events[Number(node.dataset.event)])) {
      node.addEventListener(event === 'change' && node.matches('input,textarea') ? 'input' : event, handler);
    }
  });
  root.querySelectorAll('select').forEach(select => {
    select.value = state.pages.LandingPage?.formData?.size || '';
  });
  root.querySelectorAll('textarea').forEach(el => el.setAttribute('aria-label','Your response to Jamie'));
  root.querySelectorAll('button').forEach(el => {
    if (el.textContent.trim() === 'Sound on' || el.textContent.trim() === 'Sound off')
      el.setAttribute('aria-label', el.textContent.trim());
  });
  const restore = activeId ? document.getElementById(activeId) : isTextarea ? root.querySelector('textarea') : null;
  if (restore) {
    restore.focus({preventScroll: true});
    if (typeof start === 'number' && restore.setSelectionRange && restore.type !== 'email')
      restore.setSelectionRange(start, end);
  }
}
function playTone() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    const audio = new Audio(), tone = audio.createOscillator(), gain = audio.createGain();
    tone.type = 'sine'; tone.frequency.value = 523.25;
    gain.gain.setValueAtTime(0.035,audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,audio.currentTime+0.18);
    tone.connect(gain); gain.connect(audio.destination); tone.start(); tone.stop(audio.currentTime+0.2);
    tone.onended = () => audio.close();
  } catch (_) { /* Text confirmation remains available when audio is blocked. */ }
}
function returnToSurvey() {
  commit({returnAttempts:[...state.returnAttempts, new Date().toISOString()]});
  if (!SURVEY_URL) {
    alert('No survey return URL has been configured for this demonstration. Your results are saved in this browser. Return to your original Qualtrics tab to continue.');
    return;
  }
  const url = new URL(SURVEY_URL);
  if (url.protocol !== 'https:') { alert('Please configure an HTTPS survey URL.'); return; }
  url.searchParams.set('studyId',state.studyId);
  url.searchParams.set('course','basic-dei');
  url.searchParams.set('status',state.completionStatus || 'in_progress');
  location.assign(url.href);
}


// quizData.js
const QUIZ_QUESTIONS = [
    {
        id: 1,
        context: 'A hotel guest checks in and the front desk agent assumes the guest speaks only English without asking.',
        question: 'What does this assumption most likely reflect?',
        options: [
            'Standard hospitality protocol',
            'An unconscious bias based on appearance',
            'A reasonable operational shortcut',
            'A guest preference identified in the booking',
        ],
        correctIndex: 1,
        explanation: 'Assuming a language preference based on appearance is a form of unconscious bias. It can make guests feel unseen and unwelcome. Best practice is to greet guests and let them indicate their preference.',
    },
    {
        id: 2,
        context: 'During a team meeting, a colleague\'s idea is briefly acknowledged but ignored. Minutes later, the same idea is praised when raised by someone else.',
        question: 'This pattern is an example of:',
        options: [
            'A misunderstanding that happens occasionally',
            'Affinity bias toward the second speaker',
            'Attribution bias based on seniority',
            'Both B and C could be at play',
        ],
        correctIndex: 3,
        explanation: 'When an idea receives credit based on who says it rather than what is said, affinity bias (favoring those similar to us) and attribution bias (crediting work based on perceived status) can both be operating simultaneously.',
    },
    {
        id: 3,
        context: 'A new team member is excluded from after-work social events because the organizer assumes they won\'t be interested.',
        question: 'Which inclusive action would best address this situation?',
        options: [
            'Stop organizing team social events',
            'Extend a personal, low-pressure invitation and respect their choice',
            'Ask the team to vote on whether to include new members',
            'Wait until the new member has been there three months',
        ],
        correctIndex: 1,
        explanation: 'Inclusion means extending invitations and allowing people to choose for themselves. A low-pressure, personal invite respects both belonging and autonomy without making assumptions about interest.',
    },
    {
        id: 4,
        context: 'A hotel guest uses a wheelchair and asks about accessible facilities. The concierge gives a vague answer without checking accurate information.',
        question: 'What is the most equitable response to this guest?',
        options: [
            'Offer to ask a colleague and return with accurate information promptly',
            'Direct the guest to the website for accessibility details',
            'Assume the guest will figure it out themselves',
            'Apologize and move on to the next guest',
        ],
        correctIndex: 0,
        explanation: 'Equity means providing what each person actually needs. For an accessibility question, accurate, timely information matters — offering to find the correct answer and returning promptly is the equitable action.',
    },
    {
        id: 5,
        context: 'A manager consistently assigns high-visibility projects to employees who remind them of their younger self.',
        question: 'This behavior is most accurately described as:',
        options: [
            'Smart talent identification',
            'Affinity bias affecting opportunity distribution',
            'Merit-based promotion',
            'Standard performance management',
        ],
        correctIndex: 1,
        explanation: 'Affinity bias leads us to favor people who resemble us. When it shapes who receives high-visibility opportunities, it creates systemic inequity — some employees advance not because of skill but because of similarity to decision-makers.',
    },
    {
        id: 6,
        context: 'During onboarding, new staff are shown only images of a single racial group in all training materials.',
        question: 'Which principle does this most directly undermine?',
        options: [
            'Operational efficiency',
            'Representation and belonging',
            'Compliance with labor law',
            'Employee punctuality',
        ],
        correctIndex: 1,
        explanation: 'Representation matters. When training materials reflect only one group, employees from other backgrounds may feel invisible or like their presence is not anticipated. Inclusive imagery signals that everyone belongs.',
    },
    {
        id: 7,
        context: 'A guest is speaking with an accent and a staff member repeats the guest\'s words back slowly and loudly as if they can\'t understand English.',
        question: 'What should the staff member do instead?',
        options: [
            'Speak even more slowly until the guest responds',
            'Ask a colleague to take over the conversation',
            'Speak at a normal pace, use clear language, and confirm understanding respectfully',
            'Hand the guest a written note',
        ],
        correctIndex: 2,
        explanation: 'Speaking slowly and loudly to someone with an accent conflates accent with comprehension ability. Clear, respectful communication at a normal pace — with a check-in like "Does that answer your question?" — is more effective and respectful.',
    },
    {
        id: 8,
        context: 'An employee learns that a colleague uses they/them pronouns. The employee continues to use he/him.',
        question: 'What is the most constructive response after being corrected?',
        options: [
            'Explain that old habits are hard to break',
            'Avoid using any pronouns when referring to that colleague',
            'Sincerely apologize, correct yourself, and practice using the right pronouns',
            'Ask the colleague why they chose those pronouns',
        ],
        correctIndex: 2,
        explanation: 'Using correct pronouns is a basic form of respect. When you make a mistake, a brief, sincere apology followed by self-correction — without making it the colleague\'s problem to manage — is the most inclusive response.',
    },
];

// rolePlayData.js
const ROLE_PLAY_SCENARIO = {
    title: 'The After-Briefing Moment',
    context: 'You\'ve just finished a morning briefing with your team. Afterwards, you notice that Jamie, a new colleague who joined two weeks ago, is standing alone looking confused. You overheard that the team was using a lot of internal abbreviations and jargon during the meeting.',
    avatarRole: 'Playing new colleague (Jamie)',
    goal: 'Practice understanding Jamie\'s experience, asking what support they need, and offering a concrete action within your authority.',
};
const AVATAR_OPENERS = [
    "Oh — hi. Sorry, I'm just trying to figure out what half of that meeting meant. Everyone kept saying 'EOD KPIs for the F&B SOP review' and I just… nodded along. Is it always like this?",
];
const AVATAR_ROUND_RESPONSES = [
    // After Round 1 (understanding/empathy)
    "Yeah, exactly. I didn't want to stop the whole meeting and ask what everything meant. I thought I'd pick it up eventually but honestly it's a bit isolating. Like everyone's in on something I'm not.",
    // After Round 2 (asking what they need)
    "That would actually be really helpful. Even just knowing what the key abbreviations mean would make a big difference. I didn't know who to ask without seeming like I wasn't prepared.",
    // After Round 3 (offering support action)
    "Thank you. That means a lot. I was starting to wonder if I'd made the right choice joining this team.",
];
const HINTS = [
    "Round 1 hint: Try to acknowledge how Jamie is feeling before jumping to solutions. Show you genuinely understand the experience of being left out.",
    "Round 2 hint: Ask Jamie directly what would help them — a glossary, a buddy, a catch-up chat? Let them guide what support looks like.",
    "Round 3 hint: Offer one specific, concrete action you can actually take — sharing a terminology doc, scheduling a 15-minute catch-up, or introducing them to someone who can help.",
];
const COACH_FEEDBACK_TEMPLATE = {
    strength: "You showed genuine care for Jamie's experience and created space for them to open up about feeling excluded — that's exactly the kind of attentiveness that makes new colleagues feel seen.",
    improvement: "Consider being even more specific in your support offer. Saying 'I'll send you our team glossary by end of day' is more actionable than 'I can help' — specificity signals follow-through.",
    exampleResponse: "\"I noticed you looked a bit lost in there — honestly, our team has a jargon problem. I felt the same when I started. I'm going to send you a quick glossary of our most-used terms this afternoon. And if you ever want a 15-minute debrief after briefings, I'm happy to make that a regular thing.\"",
};

// NavBar.js
function NavBar({ showBack = false, onExit }) {
    const navigate = go;
    const location = { pathname: currentPath() };
    const isPortal = location.pathname === '/portal';
    return (html("header", { className: "fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-14", style: { background: 'var(--foreground)', borderBottom: '1px solid rgba(244,239,230,0.08)' } },
        html("button", { onClick: onExit || (() => navigate('/portal')), className: "font-serif text-lg tracking-tight transition-opacity hover:opacity-80", style: { color: 'var(--background)' } },
            "Common",
            html("span", { style: { color: 'var(--accent)' } }, "Ground")),
        !isPortal && (html("button", { onClick: onExit || (() => navigate('/portal')), className: "font-sans text-xs uppercase tracking-widest px-4 py-2 transition-opacity hover:opacity-70", style: { color: 'rgba(244,239,230,0.45)', letterSpacing: '0.14em' } }, "\u2715 Exit"))));
}

// CompletionPage.js
function CompletionPage() {
    const navigate = go;
    const { completionStatus, firstScore, correctedScore, achievementPoints, badgeEarned } = learning;
    const isPassed = completionStatus === 'passed';
    const isFinishedNotPassed = completionStatus === 'finished_not_passed';
    const isInterrupted = completionStatus === 'interrupted';
    const displayScore = correctedScore ?? firstScore ?? 0;
    return (html("div", { className: "min-h-screen", style: { background: 'var(--background)' } },
        html(NavBar, null),
        html("div", { className: "pt-14 max-w-2xl mx-auto px-6 py-14 text-center" },
            html("div", { className: "w-20 h-20 rounded-full flex items-center justify-center text-3xl mx-auto mb-8", style: { background: isPassed ? 'var(--accent)' : isInterrupted ? 'var(--muted)' : 'var(--secondary)' } }, isPassed ? '★' : isInterrupted ? '⚠' : '◎'),
            html("h1", { className: "font-serif font-light mb-4", style: { fontSize: 'clamp(2rem, 5vw, 3rem)', color: 'var(--foreground)', lineHeight: 1.1 } }, isPassed
                ? 'Course Completed'
                : isInterrupted
                    ? 'Technical Interruption'
                    : 'Practice Finished'),
            html("p", { className: "font-sans text-sm leading-relaxed mb-10 max-w-md mx-auto", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, isPassed
                ? "You've completed Basic DEI and met the passing grade. Your results have been recorded."
                : isInterrupted
                    ? 'A technical issue interrupted your session. Your progress has been saved and you can return to continue.'
                    : "You completed all required steps, but your quiz score was below the 85% passing grade. Your progress and scores have been recorded accurately."),
            !isInterrupted && (html("div", { className: "grid grid-cols-2 gap-4 mb-10 text-left max-w-sm mx-auto" },
                html("div", { className: "p-5", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-2", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "Final Score"),
                    html("p", { className: "font-serif text-3xl font-light", style: { color: displayScore >= 85 ? 'var(--accent)' : 'var(--foreground)' } },
                        displayScore,
                        "%")),
                isPassed && (html("div", { className: "p-5", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-2", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "Points Earned"),
                    html("p", { className: "font-serif text-3xl font-light", style: { color: 'var(--accent)' } },
                        "+",
                        achievementPoints))),
                isPassed && badgeEarned && (html("div", { className: "col-span-2 p-5 flex items-center gap-4", style: { background: 'var(--foreground)', borderRadius: '2px' } },
                    html("span", { className: "text-2xl" }, "★"),
                    html("div", null,
                        html("p", { className: "font-sans text-xs uppercase tracking-widest mb-1", style: { color: 'rgba(244,239,230,0.45)', letterSpacing: '0.12em' } }, "Badge Unlocked"),
                        html("p", { className: "font-serif text-lg font-light", style: { color: 'var(--background)' } }, "First Step")))))),
            html("div", { className: "mb-10 p-5 text-left", style: { background: 'var(--muted)', borderRadius: '2px', border: '1px solid var(--border)' } },
                html("p", { className: "font-sans text-xs leading-relaxed", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                    html("strong", { style: { fontWeight: 500, color: 'var(--foreground)' } }, "Note:"),
                    " These are training process scores. They do not replace the independent post-survey in Qualtrics, which both groups complete separately.")),
            html("div", { className: "flex flex-col sm:flex-row gap-3 justify-center" },
                html("button", { onClick: returnToSurvey, className: "font-sans text-sm py-3 px-8 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.06em' } }, "Return to Survey \u2192"),
                html("button", { onClick: () => navigate('/portal'), className: "font-sans text-sm py-3 px-8 transition-opacity hover:opacity-70", style: { border: '1px solid var(--border)', color: 'var(--foreground)', borderRadius: '2px', fontWeight: 400 } }, "Back to Portal")),
            isInterrupted && (html("div", { className: "mt-6" },
                html("button", { onClick: () => navigate('/course/video'), className: "font-sans text-xs py-2 px-5", style: { color: 'var(--accent)', fontWeight: 400 } }, "\u2190 Resume where I left off"))))));
}

// CourseIntroPage.js
function CourseIntroPage() {
    const navigate = go;
    const { phase, setPhase } = learning;
    const hasProgress = phase !== 'portal' && phase !== 'intro';
    function handleStart() {
        setPhase('video');
        navigate('/course/video');
    }
    function handleContinue() {
        const map = {
            video: '/course/video',
            quiz: '/course/quiz',
            results: '/course/results',
            retry: '/course/retry',
            roleplay: '/course/roleplay',
            feedback: '/course/feedback',
            completion: '/course/completion',
        };
        navigate(map[phase] || '/course/video');
    }
    return (html("div", { className: "min-h-screen", style: { background: 'var(--background)' } },
        html(NavBar, null),
        html("div", { className: "pt-14" },
            html("div", { className: "relative h-52 md:h-64 overflow-hidden" },
                html("img", { src: img1, alt: "Diverse faces", className: "absolute inset-0 w-full h-full object-cover object-top", style: { filter: 'brightness(0.45) saturate(0.75)' } }),
                html("div", { className: "relative px-6 pt-12 md:pt-16" },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-2", style: { color: 'var(--accent)', letterSpacing: '0.18em' } }, "Course 1 of 6"),
                    html("h1", { className: "font-serif font-light", style: { fontSize: 'clamp(2rem, 5vw, 3rem)', color: 'var(--background)', lineHeight: 1.1 } }, "Basic DEI"))),
            html("div", { className: "max-w-2xl mx-auto px-6 py-10" },
                html("div", { className: "mb-8" },
                    html("p", { className: "font-sans text-sm leading-relaxed", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Foundations of Diversity, Equity & Inclusion for hospitality professionals. This course introduces the core concepts and practical skills you need to create a more inclusive workplace \u2014 one interaction at a time.")),
                html("div", { className: "mb-8" },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-4", style: { color: 'var(--muted-foreground)', letterSpacing: '0.14em' } }, "Learning Objectives"),
                    html("div", { className: "space-y-3" }, [
                        'Recognize common forms of unconscious bias in workplace interactions',
                        'Apply inclusive language in everyday communication with colleagues and guests',
                        'Practice active allyship using the role-play scenario',
                        'Understand the structural dimensions of equity in hospitality settings',
                    ].map(obj => (html("div", { key: obj, className: "flex items-start gap-3" },
                        html("span", { className: "mt-1 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center", style: { background: 'var(--accent)' } },
                            html("svg", { width: "8", height: "8", viewBox: "0 0 8 8", fill: "none" },
                                html("path", { d: "M1.5 4L3.5 6L6.5 2", stroke: "#F4EFE6", strokeWidth: "1.2", strokeLinecap: "round", strokeLinejoin: "round" }))),
                        html("span", { className: "font-sans text-sm leading-relaxed", style: { color: 'var(--foreground)', fontWeight: 300 } }, obj)))))),
                html("div", { className: "mb-10 p-6", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-5", style: { color: 'var(--muted-foreground)', letterSpacing: '0.14em' } }, "Course Structure"),
                    html("div", { className: "space-y-4" }, [
                        { icon: '▶', label: 'Video', detail: '≤ 3 minutes · Required viewing' },
                        { icon: '◻', label: '8 Practice Questions', detail: 'One at a time · 85% to pass' },
                        { icon: '◻', label: 'Role-Play Scenario', detail: '3 rounds of text responses · Mandatory' },
                    ].map(item => (html("div", { key: item.label, className: "flex items-center gap-4" },
                        html("span", { className: "w-8 text-center font-sans text-sm", style: { color: 'var(--accent)' } }, item.icon),
                        html("div", null,
                            html("p", { className: "font-sans text-sm font-medium", style: { color: 'var(--foreground)' } }, item.label),
                            html("p", { className: "font-sans text-xs", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, item.detail)))))),
                    html("div", { className: "mt-5 pt-5", style: { borderTop: '1px solid var(--border)' } },
                        html("p", { className: "font-sans text-xs", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                            html("strong", { style: { fontWeight: 500, color: 'var(--foreground)' } }, "Passing grade:"),
                            " 85% (7 of 8 questions correct) \u00B7 Wrong answers may be retried once"))),
                html("div", { className: "flex items-center gap-3 mb-10" },
                    html("span", { style: { color: 'var(--muted-foreground)' } }, ""),
                    html("p", { className: "font-sans text-sm", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                        "Estimated time: ",
                        html("strong", { style: { color: 'var(--foreground)', fontWeight: 500 } }, "~45 minutes"))),
                hasProgress ? (html("div", { className: "flex flex-col sm:flex-row gap-3" },
                    html("button", { onClick: handleContinue, className: "font-sans text-sm py-3 px-8 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.06em' } }, "Continue Learning \u2192"),
                    html("p", { className: "font-sans text-xs self-center", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Your progress has been saved"))) : (html("button", { onClick: handleStart, className: "font-sans text-sm py-3 px-8 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.06em' } }, "Start Learning \u2192"))))));
}

// FeedbackPage.js
function FeedbackPage() {
    const navigate = go;
    const { confirmFeedback, setCompletionStatus, awardPoints, firstScore, correctedScore, setPhase } = learning;
    const displayScore = correctedScore ?? firstScore ?? 0;
    const passed = displayScore >= 85;
    function handleFinish() {
        confirmFeedback();
        if (passed) {
            awardPoints();
            setCompletionStatus('passed');
        }
        else {
            setCompletionStatus('finished_not_passed');
        }
        setPhase('completion');
        navigate('/course/completion');
    }
    return (html("div", { className: "min-h-screen", style: { background: 'var(--background)' } },
        html(NavBar, null),
        html("div", { className: "pt-14 max-w-2xl mx-auto px-6 py-10" },
            html("div", { className: "flex items-center gap-4 mb-8 p-5", style: { background: 'var(--foreground)', borderRadius: '2px' } },
                html("div", { className: "w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0", style: { background: 'var(--accent)' } }, "◇"),
                html("div", null,
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-1", style: { color: 'rgba(244,239,230,0.45)', letterSpacing: '0.14em' } }, "Your Learning Coach"),
                    html("p", { className: "font-serif text-lg font-light", style: { color: 'var(--background)' } }, "Practice Complete \u2014 Here's Your Feedback"),
                    html("p", { className: "font-sans text-xs mt-2", style: { color: 'rgba(244,239,230,0.6)' } }, "Prototype: illustrative preset feedback, not an individualized AI assessment."))),
            html("div", { className: "mb-5 p-6", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                html("div", { className: "flex items-center gap-3 mb-3" },
                    html("span", { className: "w-6 h-6 rounded-full flex items-center justify-center text-xs", style: { background: 'rgba(122,78,45,0.15)', color: 'var(--accent)' } }, "\u2605"),
                    html("p", { className: "font-sans text-xs uppercase tracking-widest", style: { color: 'var(--accent)', letterSpacing: '0.14em' } }, "Strength")),
                html("p", { className: "font-sans text-sm leading-relaxed", style: { color: 'var(--foreground)', fontWeight: 300 } }, COACH_FEEDBACK_TEMPLATE.strength)),
            html("div", { className: "mb-5 p-6", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                html("div", { className: "flex items-center gap-3 mb-3" },
                    html("span", { className: "w-6 h-6 rounded-full flex items-center justify-center text-xs", style: { background: 'var(--muted)', color: 'var(--muted-foreground)' } }, "\u2191"),
                    html("p", { className: "font-sans text-xs uppercase tracking-widest", style: { color: 'var(--muted-foreground)', letterSpacing: '0.14em' } }, "One thing to strengthen")),
                html("p", { className: "font-sans text-sm leading-relaxed", style: { color: 'var(--foreground)', fontWeight: 300 } }, COACH_FEEDBACK_TEMPLATE.improvement)),
            html("div", { className: "mb-10 p-6", style: { background: 'var(--foreground)', borderRadius: '2px' } },
                html("div", { className: "flex items-center gap-3 mb-3" },
                    html("span", { className: "w-6 h-6 rounded-full flex items-center justify-center text-xs", style: { background: 'rgba(244,239,230,0.1)', color: 'rgba(244,239,230,0.6)' } }, "◻"),
                    html("p", { className: "font-sans text-xs uppercase tracking-widest", style: { color: 'rgba(244,239,230,0.45)', letterSpacing: '0.14em' } }, "Example response")),
                html("p", { className: "font-sans text-sm leading-relaxed", style: { color: 'rgba(244,239,230,0.75)', fontWeight: 300, fontStyle: 'italic' } }, COACH_FEEDBACK_TEMPLATE.exampleResponse)),
            html("button", { onClick: handleFinish, className: "w-full font-sans text-sm py-4 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.06em' } }, "Finish Practice"))));
}

// LandingPage.js
const modules = [
    { number: '01', title: 'Understanding Unconscious Bias', duration: '90 min', desc: 'Recognize the automatic mental shortcuts that shape our perceptions of others — and learn evidence-based strategies to interrupt them.', tag: 'Foundational' },
    { number: '02', title: 'Inclusive Language & Communication', duration: '75 min', desc: 'Build a shared vocabulary. Learn how word choices signal belonging or exclusion, and practice language that opens conversation rather than closes it.', tag: 'Practical' },
    { number: '03', title: 'Allyship in Action', duration: '2 hrs', desc: 'Move beyond awareness into action. Explore what active allyship looks like across different identities, power dynamics, and workplace contexts.', tag: 'Applied' },
    { number: '04', title: 'Building Equitable Systems', duration: '2 hrs', desc: 'Examine how policies, hiring practices, and team culture either reinforce or dismantle structural inequities — then redesign with equity at the center.', tag: 'Leadership' },
];
const stats = [
    { value: '83%', label: 'of employees report feeling more confident in cross-cultural conversations after completing our training' },
    { value: '2×', label: 'more likely to retain diverse talent when teams complete equity training within their first year' },
    { value: '91%', label: 'facilitator satisfaction rate across organizations of every size and sector' },
];
const testimonials = [
    { quote: "This wasn't a box-ticking exercise. It changed how I show up as a manager — how I listen, how I advocate, how I notice what I was missing.", name: 'Priya Menon', role: 'Director of Product, Meridian Health' },
    { quote: "We've done DEI trainings before. This one was different. The materials felt honest, not performative. People actually talked.", name: 'James Okafor', role: 'Chief People Officer, Atlien Co.' },
    { quote: "Our team came out of this with a shared language we hadn't had before. Small shift, enormous difference.", name: 'Saoirse Flynn', role: 'Head of Culture, Linework Studio' },
];
function LandingPage() {
    const navigate = go;
    const menuOpen = pageValue('LandingPage', 'menuOpen', () => (false));
    const setMenuOpen = value => changePage('LandingPage', 'menuOpen', value);
    const activeModule = pageValue('LandingPage', 'activeModule', () => (null));
    const setActiveModule = value => changePage('LandingPage', 'activeModule', value);
    const formData = pageValue('LandingPage', 'formData', () => ({ name: '', org: '', email: '', size: '' }));
    const setFormData = value => changePage('LandingPage', 'formData', value);
    const submitted = pageValue('LandingPage', 'submitted', () => (false));
    const setSubmitted = value => changePage('LandingPage', 'submitted', value);
    function handleSubmit(e) {
        e.preventDefault();
        setSubmitted(true);
    }
    return (html("div", { className: "min-h-screen", style: { background: 'var(--background)', color: 'var(--foreground)' } },
        html("nav", { style: { borderBottom: '1px solid var(--border)' }, className: "fixed top-0 left-0 right-0 z-50 backdrop-blur-sm" },
            html("div", { style: { background: 'rgba(244,239,230,0.92)' }, className: "absolute inset-0" }),
            html("div", { className: "relative max-w-7xl mx-auto px-6 flex items-center justify-between h-16" },
                html("button", { onClick: () => navigate('/'), className: "font-serif text-xl tracking-tight", style: { color: 'var(--foreground)' } },
                    "Common",
                    html("span", { style: { color: 'var(--accent)' } }, "Ground")),
                html("div", { className: "hidden md:flex items-center gap-8" }, ['Program', 'Approach', 'Impact', 'Testimonials'].map(item => (html("a", { key: item, href: `#${item.toLowerCase()}`, className: "text-sm font-sans transition-colors duration-200 hover:opacity-100", style: { color: 'var(--muted-foreground)', fontWeight: 500, letterSpacing: '0.02em' } }, item)))),
                html("div", { className: "hidden md:flex items-center gap-3" },
                    html("button", { onClick: () => navigate('/portal'), className: "text-sm font-sans px-4 py-2 transition-opacity hover:opacity-80", style: { color: 'var(--foreground)', fontWeight: 400 } }, "Sign In"),
                    html("button", { onClick: () => navigate('/portal'), className: "text-sm font-sans px-5 py-2 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', fontWeight: 500, borderRadius: '2px', letterSpacing: '0.04em' } }, "Start Training \u2192")),
                html("button", { className: "md:hidden p-2", onClick: () => setMenuOpen(!menuOpen), "aria-label": "Toggle menu" },
                    html("div", { className: "w-5 flex flex-col gap-1" },
                        html("span", { className: "block h-px", style: { background: 'var(--foreground)', transition: 'transform 0.2s', transform: menuOpen ? 'rotate(45deg) translateY(4px)' : 'none' } }),
                        html("span", { className: "block h-px", style: { background: 'var(--foreground)', opacity: menuOpen ? 0 : 1, transition: 'opacity 0.2s' } }),
                        html("span", { className: "block h-px", style: { background: 'var(--foreground)', transition: 'transform 0.2s', transform: menuOpen ? 'rotate(-45deg) translateY(-4px)' : 'none' } })))),
            menuOpen && (html("div", { className: "relative md:hidden px-6 pb-6 flex flex-col gap-4", style: { background: 'var(--background)' } },
                ['Program', 'Approach', 'Impact', 'Testimonials'].map(item => (html("a", { key: item, href: `#${item.toLowerCase()}`, className: "text-sm font-sans", style: { color: 'var(--foreground)', fontWeight: 500 }, onClick: () => setMenuOpen(false) }, item))),
                html("button", { onClick: () => navigate('/portal'), className: "text-sm font-sans px-5 py-2 text-center", style: { background: 'var(--foreground)', color: 'var(--background)', fontWeight: 500, borderRadius: '2px' } }, "Start Training \u2192")))),
        html("section", { className: "relative min-h-screen flex items-end pt-16" },
            html("div", { className: "absolute inset-0 overflow-hidden" },
                html("img", { src: img1, alt: "Composite portrait representing human diversity", className: "w-full h-full object-cover object-center", style: { filter: 'brightness(0.72) saturate(0.85)' } }),
                html("div", { className: "absolute inset-0", style: { background: 'linear-gradient(to bottom, rgba(38,26,15,0.15) 0%, rgba(38,26,15,0.72) 100%)' } })),
            html("div", { className: "relative max-w-7xl mx-auto px-6 pb-20 md:pb-28 w-full" },
                html("div", { className: "max-w-3xl" },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-6", style: { color: 'rgba(244,239,230,0.65)', letterSpacing: '0.2em' } }, "Diversity \u00B7 Equity \u00B7 Inclusion Training"),
                    html("h1", { className: "font-serif leading-none mb-8", style: { color: '#F4EFE6', fontSize: 'clamp(3rem, 8vw, 7rem)', fontWeight: 300 } },
                        "We are stronger",
                        html("br", null),
                        html("em", { style: { color: 'var(--accent)', fontStyle: 'italic' } }, "together.")),
                    html("p", { className: "font-sans text-base md:text-lg mb-10 max-w-xl leading-relaxed", style: { color: 'rgba(244,239,230,0.8)', fontWeight: 300 } }, "CommonGround is a transformative training program that helps organizations move from awareness to action \u2014 building cultures where every person belongs."),
                    html("div", { className: "flex flex-wrap gap-4" },
                        html("button", { onClick: () => navigate('/portal'), className: "font-sans px-8 py-3 text-sm transition-opacity hover:opacity-90", style: { background: 'var(--accent)', color: '#F4EFE6', fontWeight: 500, borderRadius: '2px', letterSpacing: '0.04em' } }, "Start Your Training \u2192"),
                        html("a", { href: "#program", className: "font-sans px-8 py-3 text-sm transition-opacity hover:opacity-80", style: { border: '1px solid rgba(244,239,230,0.5)', color: '#F4EFE6', fontWeight: 400, borderRadius: '2px', letterSpacing: '0.04em' } }, "Explore the Program"))))),
        html("section", { style: { background: 'var(--foreground)', color: 'var(--background)' }, className: "py-10 overflow-hidden" },
            html("div", { className: "max-w-7xl mx-auto px-6 flex flex-wrap gap-12 items-center justify-between" },
                html("p", { className: "font-serif text-2xl md:text-3xl font-light leading-snug max-w-xl", style: { color: 'var(--background)' } },
                    "\"Different Isn't Bad \u2014 ",
                    html("em", { style: { color: 'var(--accent)' } }, "It's Just Not The Same."),
                    "\""),
                html("div", { className: "flex gap-10" },
                    html("div", null,
                        html("p", { className: "font-serif text-3xl md:text-4xl font-light", style: { color: 'var(--accent)' } }, "4,200+"),
                        html("p", { className: "font-sans text-xs uppercase tracking-widest mt-1 opacity-60" }, "Organizations Trained")),
                    html("div", null,
                        html("p", { className: "font-serif text-3xl md:text-4xl font-light", style: { color: 'var(--accent)' } }, "38 Countries"),
                        html("p", { className: "font-sans text-xs uppercase tracking-widest mt-1 opacity-60" }, "Global Reach"))))),
        html("section", { id: "approach", className: "py-24 md:py-36" },
            html("div", { className: "max-w-7xl mx-auto px-6" },
                html("div", { className: "grid md:grid-cols-2 gap-16 items-center" },
                    html("div", null,
                        html("p", { className: "font-sans text-xs uppercase tracking-widest mb-6", style: { color: 'var(--accent)', letterSpacing: '0.2em' } }, "Our Approach"),
                        html("h2", { className: "font-serif font-light leading-tight mb-8", style: { fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--foreground)' } },
                            "Not a checkbox.",
                            html("br", null),
                            html("em", { style: { color: 'var(--muted-foreground)', fontStyle: 'italic' } }, "A conversation.")),
                        html("div", { className: "space-y-6 font-sans text-base leading-relaxed", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                            html("p", null, "Most DEI training fails because it treats people as problems to be corrected rather than whole humans capable of growth. We do the opposite."),
                            html("p", null, "CommonGround is grounded in psychology, sociology, and lived experience. Our facilitators create space for honest reckoning \u2014 with structural systems, personal bias, and the messy middle ground of real change."),
                            html("p", null, "Every session is facilitated live, never pre-recorded. Because this work requires presence.")),
                        html("div", { className: "mt-10 flex flex-col gap-4" }, ['Research-backed curriculum', 'Live facilitation — no pre-recorded modules', 'Customized for your industry and org size', 'Follow-up coaching available'].map(point => (html("div", { key: point, className: "flex items-start gap-3" },
                            html("span", { className: "mt-1 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center", style: { background: 'var(--accent)' } },
                                html("svg", { width: "8", height: "8", viewBox: "0 0 8 8", fill: "none" },
                                    html("path", { d: "M1.5 4L3.5 6L6.5 2", stroke: "#F4EFE6", strokeWidth: "1.2", strokeLinecap: "round", strokeLinejoin: "round" }))),
                            html("span", { className: "text-sm font-sans", style: { color: 'var(--foreground)', fontWeight: 400 } }, point)))))),
                    html("div", { className: "relative" },
                        html("div", { className: "aspect-[3/4] overflow-hidden", style: { borderRadius: '2px' } },
                            html("img", { src: img6, alt: "Hands of many skin tones coming together", className: "w-full h-full object-cover" })),
                        html("div", { className: "absolute -bottom-6 -left-6 w-40 h-40 overflow-hidden", style: { borderRadius: '2px', border: '4px solid var(--background)' } },
                            html("img", { src: img9, alt: "Earthy ceramic vessels representing cultural heritage", className: "w-full h-full object-cover" })))))),
        html("section", { id: "program", className: "py-24 md:py-36", style: { background: 'var(--muted)' } },
            html("div", { className: "max-w-7xl mx-auto px-6" },
                html("div", { className: "flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16" },
                    html("div", null,
                        html("p", { className: "font-sans text-xs uppercase tracking-widest mb-4", style: { color: 'var(--accent)', letterSpacing: '0.2em' } }, "The Program"),
                        html("h2", { className: "font-serif font-light leading-tight", style: { fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--foreground)' } },
                            "Four sessions.",
                            html("br", null),
                            "One transformation.")),
                    html("p", { className: "font-sans text-sm max-w-xs leading-relaxed", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Designed to be taken in sequence, or adapted to your team's specific needs.")),
                html("div", { className: "grid md:grid-cols-2 gap-px", style: { background: 'var(--border)' } }, modules.map((mod, i) => (html("div", { key: mod.number, className: "p-8 md:p-10 cursor-pointer transition-colors duration-200", style: { background: activeModule === i ? 'var(--foreground)' : 'var(--card)', color: activeModule === i ? 'var(--background)' : 'var(--foreground)' }, onClick: () => setActiveModule(activeModule === i ? null : i) },
                    html("div", { className: "flex items-start justify-between mb-6" },
                        html("span", { className: "font-serif text-5xl font-light", style: { color: activeModule === i ? 'var(--accent)' : 'var(--border)', lineHeight: 1 } }, mod.number),
                        html("span", { className: "font-sans text-xs px-3 py-1 uppercase tracking-widest", style: { background: activeModule === i ? 'rgba(244,239,230,0.1)' : 'var(--muted)', color: activeModule === i ? 'rgba(244,239,230,0.7)' : 'var(--muted-foreground)', letterSpacing: '0.12em', borderRadius: '2px' } }, mod.tag)),
                    html("h3", { className: "font-serif text-xl md:text-2xl font-light mb-3 leading-snug" }, mod.title),
                    html("p", { className: "font-sans text-xs mb-4", style: { color: activeModule === i ? 'rgba(244,239,230,0.55)' : 'var(--muted-foreground)', letterSpacing: '0.06em' } }, mod.duration),
                    activeModule === i && html("p", { className: "font-sans text-sm leading-relaxed", style: { color: 'rgba(244,239,230,0.75)', fontWeight: 300 } }, mod.desc),
                    activeModule !== i && html("p", { className: "font-sans text-xs", style: { color: 'var(--accent)', fontWeight: 500, letterSpacing: '0.04em' } }, "Click to learn more \u2193"))))))),
        html("section", { className: "grid md:grid-cols-2 min-h-[70vh]" },
            html("div", { className: "relative overflow-hidden min-h-[50vw] md:min-h-0" },
                html("img", { src: img7, alt: "Diversity collage art", className: "absolute inset-0 w-full h-full object-cover" })),
            html("div", { className: "flex flex-col justify-center px-10 md:px-16 py-16 md:py-24", style: { background: 'var(--foreground)' } },
                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-8", style: { color: 'var(--accent)', letterSpacing: '0.2em' } }, "Why It Matters"),
                html("blockquote", { className: "font-serif font-light leading-tight mb-8", style: { fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: 'var(--background)' } },
                    "\"Unity in Humanity.",
                    html("br", null),
                    html("em", { style: { color: 'var(--accent)', fontStyle: 'italic' } }, "Strength in Diversity."),
                    "\""),
                html("p", { className: "font-sans text-sm leading-relaxed mb-6", style: { color: 'rgba(244,239,230,0.65)', fontWeight: 300 } }, "Diverse teams outperform homogenous ones across every meaningful measure \u2014 creativity, problem-solving, retention, financial returns."),
                html("button", { onClick: () => navigate('/portal'), className: "self-start font-sans text-sm py-2 px-6 transition-opacity hover:opacity-80", style: { border: '1px solid rgba(244,239,230,0.3)', color: 'rgba(244,239,230,0.7)', borderRadius: '2px', fontWeight: 400 } }, "Begin your training \u2192"))),
        html("section", { id: "impact", className: "py-24 md:py-36 relative overflow-hidden" },
            html("div", { className: "absolute inset-0 opacity-10" },
                html("img", { src: img2, alt: "", "aria-hidden": true, className: "w-full h-full object-cover" })),
            html("div", { className: "relative max-w-7xl mx-auto px-6" },
                html("div", { className: "text-center mb-20" },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-4", style: { color: 'var(--accent)', letterSpacing: '0.2em' } }, "Impact"),
                    html("h2", { className: "font-serif font-light", style: { fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--foreground)' } }, "The numbers speak.")),
                html("div", { className: "grid md:grid-cols-3 gap-12 md:gap-8" }, stats.map(stat => (html("div", { key: stat.value, className: "text-center" },
                    html("p", { className: "font-serif font-light mb-4", style: { fontSize: 'clamp(3rem, 8vw, 5rem)', color: 'var(--accent)', lineHeight: 1 } }, stat.value),
                    html("p", { className: "font-sans text-sm leading-relaxed max-w-xs mx-auto", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, stat.label))))))),
        html("div", { className: "grid grid-cols-3 h-36 md:h-48 overflow-hidden" },
            html("div", { className: "overflow-hidden" },
                html("img", { src: img3, alt: "", "aria-hidden": true, className: "w-full h-full object-cover", style: { filter: 'brightness(0.85) saturate(0.6)' } })),
            html("div", { className: "overflow-hidden" },
                html("img", { src: img8, alt: "", "aria-hidden": true, className: "w-full h-full object-cover", style: { filter: 'brightness(0.85) saturate(0.7)' } })),
            html("div", { className: "overflow-hidden" },
                html("img", { src: img2, alt: "", "aria-hidden": true, className: "w-full h-full object-cover object-right", style: { filter: 'brightness(0.85) saturate(0.6)' } }))),
        html("section", { id: "testimonials", className: "py-24 md:py-36", style: { background: 'var(--card)' } },
            html("div", { className: "max-w-7xl mx-auto px-6" },
                html("div", { className: "mb-16" },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-4", style: { color: 'var(--accent)', letterSpacing: '0.2em' } }, "Testimonials"),
                    html("h2", { className: "font-serif font-light", style: { fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--foreground)' } }, "From those who've been through it.")),
                html("div", { className: "grid md:grid-cols-3 gap-8" }, testimonials.map(t => (html("div", { key: t.name, className: "flex flex-col p-8 md:p-10", style: { background: 'var(--background)', borderRadius: '2px' } },
                    html("p", { className: "font-serif text-lg md:text-xl font-light leading-relaxed mb-8 flex-1", style: { color: 'var(--foreground)' } },
                        "\"",
                        t.quote,
                        "\""),
                    html("div", { style: { borderTop: '1px solid var(--border)', paddingTop: '1.5rem' } },
                        html("p", { className: "font-sans text-sm font-medium", style: { color: 'var(--foreground)' } }, t.name),
                        html("p", { className: "font-sans text-xs mt-1", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, t.role)))))))),
        html("section", { id: "enroll", className: "py-24 md:py-36" },
            html("div", { className: "max-w-7xl mx-auto px-6" },
                html("div", { className: "grid md:grid-cols-2 gap-16 items-start" },
                    html("div", null,
                        html("p", { className: "font-sans text-xs uppercase tracking-widest mb-6", style: { color: 'var(--accent)', letterSpacing: '0.2em' } }, "Get Started"),
                        html("h2", { className: "font-serif font-light leading-tight mb-6", style: { fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--foreground)' } },
                            "Ready to bring",
                            html("br", null),
                            html("em", { style: { color: 'var(--accent)', fontStyle: 'italic' } }, "CommonGround"),
                            html("br", null),
                            "to your team?"),
                        html("p", { className: "font-sans text-sm leading-relaxed mb-10 max-w-sm", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Whether you're a 10-person startup or a global enterprise, explore this enquiry form. This static demonstration does not send messages."),
                        html("div", { className: "relative aspect-[4/3] max-w-sm overflow-hidden", style: { borderRadius: '2px' } },
                            html("img", { src: img8, alt: "Serene natural landscape at sunrise", className: "w-full h-full object-cover" }),
                            html("div", { className: "absolute inset-0 flex items-end p-6", style: { background: 'linear-gradient(to top, rgba(38,26,15,0.6) 0%, transparent 60%)' } },
                                html("p", { className: "font-serif text-lg font-light italic", style: { color: '#F4EFE6' } }, "\"Every journey toward equity begins with a single honest conversation.\"")))),
                    html("div", null, submitted ? (html("div", { className: "p-10 text-center", style: { background: 'var(--card)', borderRadius: '2px' } },
                        html("div", { className: "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-6", style: { background: 'var(--accent)' } },
                            html("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none" },
                                html("path", { d: "M4 10L8.5 14.5L16 6", stroke: "#F4EFE6", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }))),
                        html("h3", { className: "font-serif text-2xl font-light mb-3", style: { color: 'var(--foreground)' } }, "Thank you."),
                        html("p", { className: "font-sans text-sm leading-relaxed mb-6", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Your demo enquiry has been acknowledged locally. No message was sent."),
                        html("button", { onClick: () => navigate('/portal'), className: "font-sans text-sm py-2 px-6", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500 } }, "Go to Training Portal \u2192"))) : (html("form", { onSubmit: handleSubmit, className: "space-y-5", style: { background: 'var(--card)', padding: '2.5rem', borderRadius: '2px' } },
                        html("h3", { className: "font-serif text-xl font-light mb-6", style: { color: 'var(--foreground)' } }, "Enquire About Your Team"),
                        [
                            { id: 'name', label: 'Your Name', type: 'text', placeholder: 'Maya Johnson' },
                            { id: 'org', label: 'Organization', type: 'text', placeholder: 'Acme Corporation' },
                            { id: 'email', label: 'Work Email', type: 'email', placeholder: 'maya@acme.com' },
                        ].map(field => (html("div", { key: field.id },
                            html("label", { htmlFor: field.id, className: "block font-sans text-xs uppercase tracking-widest mb-2", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, field.label),
                            html("input", { id: field.id, type: field.type, placeholder: field.placeholder, required: true, value: formData[field.id], onChange: e => setFormData(prev => ({ ...prev, [field.id]: e.target.value })), className: "w-full font-sans text-sm px-4 py-3 outline-none transition-colors", style: { background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '2px', color: 'var(--foreground)' }, onFocus: e => (e.target.style.borderColor = 'var(--accent)'), onBlur: e => (e.target.style.borderColor = 'var(--border)') })))),
                        html("div", null,
                            html("label", { htmlFor: "size", className: "block font-sans text-xs uppercase tracking-widest mb-2", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "Team Size"),
                            html("select", { id: "size", required: true, value: formData.size, onChange: e => setFormData(prev => ({ ...prev, size: e.target.value })), className: "w-full font-sans text-sm px-4 py-3 outline-none appearance-none", style: { background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '2px', color: formData.size ? 'var(--foreground)' : 'var(--muted-foreground)' } },
                                html("option", { value: "", disabled: true }, "Select team size"),
                                html("option", { value: "1-25" }, "1 \u2013 25 people"),
                                html("option", { value: "26-100" }, "26 \u2013 100 people"),
                                html("option", { value: "101-500" }, "101 \u2013 500 people"),
                                html("option", { value: "500+" }, "500+ people"))),
                        html("button", { type: "submit", className: "w-full font-sans text-sm py-4 mt-2 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', fontWeight: 500, borderRadius: '2px', letterSpacing: '0.06em' } }, "Send Enquiry"))))))),
        html("footer", { style: { background: 'var(--foreground)', color: 'var(--background)' }, className: "py-16" },
            html("div", { className: "max-w-7xl mx-auto px-6" },
                html("div", { className: "flex flex-col md:flex-row items-start md:items-center justify-between gap-8 mb-12", style: { borderBottom: '1px solid rgba(244,239,230,0.12)', paddingBottom: '2rem' } },
                    html("button", { onClick: () => navigate('/'), className: "font-serif text-2xl font-light tracking-tight", style: { color: 'var(--background)' } },
                        "Common",
                        html("span", { style: { color: 'var(--accent)' } }, "Ground")),
                    html("div", { className: "flex flex-wrap gap-8" },
                        ['Program', 'Approach', 'Impact', 'Testimonials'].map(item => (html("a", { key: item, href: `#${item.toLowerCase()}`, className: "font-sans text-xs uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity", style: { color: 'var(--background)', letterSpacing: '0.16em' } }, item))),
                        html("button", { onClick: () => navigate('/portal'), className: "font-sans text-xs uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity", style: { color: 'var(--background)', letterSpacing: '0.16em' } }, "Portal"))),
                html("div", { className: "flex flex-col md:flex-row items-start md:items-center justify-between gap-4" },
                    html("p", { className: "font-sans text-xs", style: { color: 'rgba(244,239,230,0.4)', fontWeight: 300 } }, "\u00A9 2026 CommonGround. All rights reserved."),
                    html("p", { className: "font-serif text-sm italic", style: { color: 'rgba(244,239,230,0.35)' } }, "Unity in Humanity. Strength in Diversity."))))));
}

// PortalPage.js
const TABS = ['Courses', 'Achievements', 'AI Companion', 'My Learning'];
const COURSES = [
    { id: 'basic-dei', title: 'Basic DEI', subtitle: 'Foundations of Diversity, Equity & Inclusion', duration: '~45 min', locked: false, tag: 'Available' },
    { id: 'unconscious-bias', title: 'Unconscious Bias', subtitle: 'Recognizing and interrupting automatic thinking', duration: '~60 min', locked: true, tag: 'Coming soon' },
    { id: 'inclusive-language', title: 'Inclusive Language', subtitle: 'Words that open conversation rather than close it', duration: '~50 min', locked: true, tag: 'Coming soon' },
    { id: 'allyship', title: 'Allyship in Action', subtitle: 'Moving from awareness to advocacy', duration: '~90 min', locked: true, tag: 'Coming soon' },
    { id: 'equitable-systems', title: 'Equitable Systems', subtitle: 'Building fairness into policies and practice', duration: '~60 min', locked: true, tag: 'Coming soon' },
    { id: 'cultural-humility', title: 'Cultural Humility', subtitle: 'Ongoing learning across difference', duration: '~75 min', locked: true, tag: 'Coming soon' },
];
function PortalPage() {
    const activeTab = pageValue('PortalPage', 'activeTab', () => ('Courses'));
    const setActiveTab = value => changePage('PortalPage', 'activeTab', value);
    const navigate = go;
    const { phase, firstScore, correctedScore, achievementPoints, badgeEarned, completionStatus } = learning;
    const getCourseStatus = () => {
        if (completionStatus === 'passed')
            return 'Completed';
        if (completionStatus === 'finished_not_passed')
            return 'Finished';
        if (phase !== 'portal' && phase !== 'intro')
            return 'In Progress';
        return null;
    };
    const getResumePhase = () => {
        const map = {
            intro: '/course/intro',
            video: '/course/video',
            quiz: '/course/quiz',
            results: '/course/results',
            retry: '/course/retry',
            roleplay: '/course/roleplay',
            feedback: '/course/feedback',
            completion: '/course/completion',
        };
        return map[phase] || '/course/intro';
    };
    return (html("div", { className: "min-h-screen", style: { background: 'var(--background)' } },
        html("div", { className: "pt-0", style: { background: 'var(--foreground)' } },
            html("div", { className: "flex items-center justify-between px-6 h-14" },
                html("span", { className: "font-serif text-lg tracking-tight", style: { color: 'var(--background)' } },
                    "Common",
                    html("span", { style: { color: 'var(--accent)' } }, "Ground")),
                html("span", { className: "font-sans text-xs", style: { color: 'rgba(244,239,230,0.35)', fontWeight: 300 } }, "Local Session")),
            html("div", { className: "relative h-40 md:h-52 overflow-hidden" },
                html("img", { src: img6, alt: "Hands united across backgrounds", className: "absolute inset-0 w-full h-full object-cover", style: { filter: 'brightness(0.4) saturate(0.7)' } }),
                html("div", { className: "relative px-6 pt-8 md:pt-10" },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-2", style: { color: 'var(--accent)', letterSpacing: '0.18em' } }, "Learning Portal"),
                    html("h1", { className: "font-serif font-light", style: { fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', color: 'var(--background)', lineHeight: 1.15 } }, "Welcome back."),
                    html("p", { className: "font-sans text-sm mt-2", style: { color: 'rgba(244,239,230,0.6)', fontWeight: 300 } }, "Unity in Humanity. Strength in Diversity."))),
            html("div", { className: "flex overflow-x-auto", style: { borderTop: '1px solid rgba(244,239,230,0.08)' } }, TABS.map(tab => (html("button", { key: tab, onClick: () => setActiveTab(tab), className: "flex-shrink-0 px-5 py-3 font-sans text-xs uppercase tracking-widest transition-colors", style: {
                    color: activeTab === tab ? 'var(--accent)' : 'rgba(244,239,230,0.45)',
                    letterSpacing: '0.14em',
                    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                    background: 'transparent',
                } }, tab))))),
        html("div", { className: "max-w-4xl mx-auto px-6 py-10" },
            activeTab === 'Courses' && (html("div", null,
                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-6", style: { color: 'var(--muted-foreground)', letterSpacing: '0.14em' } }, "This Cohort \u2014 Basic DEI Pre-Trial"),
                html("div", { className: "grid md:grid-cols-2 gap-4" }, COURSES.map(course => {
                    const status = course.id === 'basic-dei' ? getCourseStatus() : null;
                    return (html("div", { key: course.id, className: "p-6 flex flex-col gap-3", style: {
                            background: course.locked ? 'var(--muted)' : 'var(--card)',
                            borderRadius: '2px',
                            border: '1px solid var(--border)',
                            opacity: course.locked ? 0.7 : 1,
                        } },
                        html("div", { className: "flex items-start justify-between gap-3" },
                            html("div", null,
                                html("p", { className: "font-serif text-lg font-light", style: { color: course.locked ? 'var(--muted-foreground)' : 'var(--foreground)' } },
                                    course.locked && ' ',
                                    course.title),
                                html("p", { className: "font-sans text-xs mt-1 leading-relaxed", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, course.subtitle)),
                            html("span", { className: "flex-shrink-0 font-sans text-xs px-2 py-1 uppercase tracking-widest", style: {
                                    background: course.locked ? 'var(--secondary)' : status === 'Completed' ? 'var(--accent)' : status === 'In Progress' ? 'var(--primary)' : 'var(--foreground)',
                                    color: course.locked ? 'var(--muted-foreground)' : 'var(--background)',
                                    borderRadius: '2px',
                                    letterSpacing: '0.1em',
                                    fontSize: '0.6rem',
                                    whiteSpace: 'nowrap',
                                } }, status || course.tag)),
                        html("p", { className: "font-sans text-xs", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                            " ",
                            course.duration),
                        !course.locked && (html("button", { onClick: () => navigate(status === 'In Progress' ? getResumePhase() : '/course/intro'), className: "mt-1 font-sans text-xs py-2 px-4 self-start transition-opacity hover:opacity-90", style: {
                                background: status === 'Completed' ? 'var(--muted)' : 'var(--foreground)',
                                color: status === 'Completed' ? 'var(--muted-foreground)' : 'var(--background)',
                                borderRadius: '2px',
                                fontWeight: 500,
                                letterSpacing: '0.08em',
                            } }, status === 'Completed' || status === 'Finished' ? 'View Completion' : status === 'In Progress' ? 'Continue Learning →' : 'Start Learning →'))));
                })))),
            activeTab === 'Achievements' && (html("div", null,
                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-8", style: { color: 'var(--muted-foreground)', letterSpacing: '0.14em' } }, "Your Progress"),
                html("div", { className: "grid md:grid-cols-3 gap-6 mb-10" },
                    html("div", { className: "p-6 text-center", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                        html("p", { className: "font-serif text-4xl font-light mb-2", style: { color: 'var(--accent)' } }, achievementPoints),
                        html("p", { className: "font-sans text-xs uppercase tracking-widest", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "Points Earned")),
                    html("div", { className: "p-6 text-center", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                        html("p", { className: "font-serif text-4xl font-light mb-2", style: { color: badgeEarned ? 'var(--accent)' : 'var(--border)' } }, badgeEarned ? '★' : '☆'),
                        html("p", { className: "font-sans text-xs uppercase tracking-widest", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "First Step Badge")),
                    html("div", { className: "p-6 text-center", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                        html("p", { className: "font-serif text-4xl font-light mb-2", style: { color: completionStatus === 'passed' ? 'var(--accent)' : 'var(--border)' } }, completionStatus === 'passed' ? '1' : '0'),
                        html("p", { className: "font-sans text-xs uppercase tracking-widest", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "Courses Completed"))),
                !badgeEarned && (html("div", { className: "p-6", style: { background: 'var(--muted)', borderRadius: '2px', border: '1px solid var(--border)' } },
                    html("p", { className: "font-sans text-sm", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Complete your first course to unlock achievements and earn your First Step badge."))))),
            activeTab === 'AI Companion' && (html("div", null,
                html("div", { className: "p-8 text-center", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                    html("div", { className: "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4", style: { background: 'var(--muted)' } },
                        html("span", { style: { fontSize: '1.8rem' } }, "◇")),
                    html("h2", { className: "font-serif text-xl font-light mb-3", style: { color: 'var(--foreground)' } }, "AI Learning Companion"),
                    html("p", { className: "font-sans text-sm leading-relaxed mb-6 max-w-sm mx-auto", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Free practice and open Q&A with your AI companion are available after you complete the post-survey. This helps ensure research data remains clean and uninfluenced."),
                    html("div", { className: "inline-flex items-center gap-2 font-sans text-xs px-4 py-2", style: { background: 'var(--muted)', color: 'var(--muted-foreground)', borderRadius: '2px' } }, " Locked until post-survey completion"),
                    html("p", { className: "font-sans text-xs mt-4", style: { color: 'var(--muted-foreground)', fontWeight: 300, opacity: 0.6 } }, "The role-play practice in your course is mandatory and accessible through the course flow.")))),
            activeTab === 'My Learning' && (html("div", null,
                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-8", style: { color: 'var(--muted-foreground)', letterSpacing: '0.14em' } }, "Current Progress"),
                html("div", { className: "space-y-4" },
                    html("div", { className: "p-6", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                        html("div", { className: "flex items-start justify-between gap-4 mb-4" },
                            html("div", null,
                                html("p", { className: "font-serif text-lg font-light", style: { color: 'var(--foreground)' } }, "Basic DEI"),
                                html("p", { className: "font-sans text-xs mt-1", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                                    "Current phase: ",
                                    html("span", { style: { color: 'var(--foreground)', fontWeight: 500 } }, phase.charAt(0).toUpperCase() + phase.slice(1)))),
                            html("span", { className: "font-sans text-xs px-2 py-1", style: { background: completionStatus === 'passed' ? 'var(--accent)' : 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontSize: '0.65rem', letterSpacing: '0.1em' } }, completionStatus === 'passed' ? 'COMPLETED' : completionStatus === 'finished_not_passed' ? 'FINISHED' : 'IN PROGRESS')),
                        firstScore !== null && (html("div", { className: "flex gap-6 mb-4" },
                            html("div", null,
                                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-1", style: { color: 'var(--muted-foreground)', letterSpacing: '0.1em' } }, "First Score"),
                                html("p", { className: "font-serif text-2xl font-light", style: { color: firstScore >= 85 ? 'var(--accent)' : 'var(--foreground)' } },
                                    firstScore,
                                    "%")),
                            correctedScore !== null && (html("div", null,
                                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-1", style: { color: 'var(--muted-foreground)', letterSpacing: '0.1em' } }, "Corrected Score"),
                                html("p", { className: "font-serif text-2xl font-light", style: { color: correctedScore >= 85 ? 'var(--accent)' : 'var(--foreground)' } },
                                    correctedScore,
                                    "%"))))),
                        phase !== 'portal' && phase !== 'completion' && (html("button", { onClick: () => navigate(getResumePhase()), className: "font-sans text-xs py-2 px-4 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.08em' } }, "Continue Learning \u2192")))))))));
}

// QuizPage.js
function QuizPage({ isRetry = false }) {
    const navigate = go;
    const { submitQuizAnswer, quizAnswers, soundEnabled, setSoundEnabled, computeFirstScore, computeCorrectedScore, setPhase } = learning;
    const missedIndices = quizAnswers.filter(a => !a.isCorrect).map(a => a.questionIndex);
    const questions = isRetry
        ? QUIZ_QUESTIONS.filter(q => missedIndices.includes(q.id - 1))
        : QUIZ_QUESTIONS;
    const currentIdx = pageValue(isRetry ? 'RetryPage' : 'QuizPage', 'currentIdx', () => (0));
    const setCurrentIdx = value => changePage(isRetry ? 'RetryPage' : 'QuizPage', 'currentIdx', value);
    const selected = pageValue(isRetry ? 'RetryPage' : 'QuizPage', 'selected', () => (null));
    const setSelected = value => changePage(isRetry ? 'RetryPage' : 'QuizPage', 'selected', value);
    const submitted = pageValue(isRetry ? 'RetryPage' : 'QuizPage', 'submitted', () => (false));
    const setSubmitted = value => changePage(isRetry ? 'RetryPage' : 'QuizPage', 'submitted', value);
    const showExitDialog = pageValue(isRetry ? 'RetryPage' : 'QuizPage', 'showExitDialog', () => (false));
    const setShowExitDialog = value => changePage(isRetry ? 'RetryPage' : 'QuizPage', 'showExitDialog', value);
    const question = questions[currentIdx];
    const totalQ = questions.length;
    const questionNum = currentIdx + 1;
    if (!question) {
        return html("div", { className: "p-10 font-sans text-sm", style: { color: 'var(--foreground)' } }, "No questions remain. Return to the portal to continue.");
    }
    function handleSubmit() {
        if (selected === null || !question)
            return;
        const isCorrect = selected === question.correctIndex;
        const globalIdx = question.id - 1;
        submitQuizAnswer(globalIdx, selected, isCorrect, isRetry);
        setSubmitted(true);
    }
    function handleContinue() {
        if (currentIdx < totalQ - 1) {
            setCurrentIdx(i => i + 1);
            setSelected(null);
            setSubmitted(false);
        }
        else {
            // Done with all questions
            if (isRetry) {
                const score = computeCorrectedScore();
                setPhase('results');
                navigate('/course/results?mode=retry');
            }
            else {
                const score = computeFirstScore();
                setPhase('results');
                navigate('/course/results');
            }
        }
    }
    const progressPct = ((currentIdx + (submitted ? 1 : 0)) / totalQ) * 100;
    return (html("div", { className: "min-h-screen", style: { background: 'var(--background)' } },
        html(NavBar, { onExit: () => setShowExitDialog(true) }),
        html("div", { className: "fixed top-14 left-0 right-0 z-40 px-5 py-3 flex items-center gap-4", style: { background: 'var(--background)', borderBottom: '1px solid var(--border)' } },
            html("span", { className: "font-sans text-xs uppercase tracking-widest flex-shrink-0", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } },
                isRetry ? 'Retry' : 'Question',
                " ",
                questionNum,
                " of ",
                totalQ),
            html("div", { className: "flex-1 h-1 rounded overflow-hidden", style: { background: 'var(--muted)' } },
                html("div", { className: "h-1 transition-all duration-300", style: { width: `${progressPct}%`, background: 'var(--accent)' } })),
            html("button", { onClick: () => setSoundEnabled(!soundEnabled), className: "font-sans text-xs flex-shrink-0", style: { color: 'var(--muted-foreground)' } }, soundEnabled ? 'Sound on' : 'Sound off')),
        html("div", { className: "pt-28 pb-10 px-5 max-w-2xl mx-auto" },
            currentIdx === 3 && !isRetry && (html("div", { className: "mb-6 px-4 py-2 font-sans text-xs text-center", style: { background: 'var(--card)', color: 'var(--muted-foreground)', borderRadius: '2px', fontWeight: 300 } }, "You’re halfway through")),
            html("div", { className: "mb-6 p-4", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-2", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "Scenario"),
                html("p", { className: "font-sans text-sm leading-relaxed", style: { color: 'var(--foreground)', fontWeight: 300 } }, question.context)),
            html("h2", { className: "font-serif text-xl font-light mb-6 leading-snug", style: { color: 'var(--foreground)' } }, question.question),
            html("div", { className: "space-y-3 mb-8" }, question.options.map((option, i) => {
                let borderColor = 'var(--border)';
                let bg = 'var(--card)';
                let textColor = 'var(--foreground)';
                if (selected === i) {
                    bg = 'var(--secondary)';
                    borderColor = 'var(--primary)';
                }
                return (html("button", { key: i, disabled: submitted, onClick: () => !submitted && setSelected(i), className: "w-full text-left px-4 py-4 font-sans text-sm leading-snug transition-colors duration-150", style: { background: bg, border: `1.5px solid ${borderColor}`, borderRadius: '2px', color: textColor, fontWeight: selected === i && !submitted ? 500 : 300, cursor: submitted ? 'default' : 'pointer' } },
                    html("span", { className: "inline-flex items-start gap-3" },
                        html("span", { className: "flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center text-xs", style: { borderColor, background: selected === i && !submitted ? 'var(--primary)' : 'transparent', color: selected === i && !submitted ? 'var(--background)' : borderColor } }, String.fromCharCode(65 + i)),
                        option)));
            })),
            submitted && (html("div", { className: "mb-6 p-4", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-1", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "Answer submitted"),
                html("p", { className: "font-sans text-sm", style: { color: 'var(--foreground)', fontWeight: 300 } }, "Your response has been recorded. Feedback will appear after all questions are complete."))),
            html("button", { onClick: submitted ? handleContinue : handleSubmit, disabled: !submitted && selected === null, className: "w-full font-sans text-sm py-4 transition-opacity", style: {
                    background: submitted ? 'var(--foreground)' : selected !== null ? 'var(--primary)' : 'var(--muted)',
                    color: selected !== null || submitted ? 'var(--background)' : 'var(--muted-foreground)',
                    borderRadius: '2px',
                    fontWeight: 500,
                    letterSpacing: '0.06em',
                    opacity: !submitted && selected === null ? 0.5 : 1,
                    cursor: !submitted && selected === null ? 'not-allowed' : 'pointer',
                } }, submitted
                ? currentIdx < totalQ - 1 ? 'Continue →' : 'View Results →'
                : 'Submit Answer')),
        showExitDialog && (html("div", { className: "fixed inset-0 z-50 flex items-center justify-center px-6", style: { background: 'rgba(38,26,15,0.6)' } },
            html("div", { className: "max-w-sm w-full p-8", style: { background: 'var(--background)', borderRadius: '2px' } },
                html("h3", { className: "font-serif text-xl font-light mb-3", style: { color: 'var(--foreground)' } }, "Leave this session?"),
                html("p", { className: "font-sans text-sm leading-relaxed mb-6", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Progress up to your last submitted answer will be saved."),
                html("div", { className: "flex gap-3" },
                    html("button", { onClick: () => navigate('/portal'), className: "font-sans text-sm py-2 px-5", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500 } }, "Save and Leave"),
                    html("button", { onClick: () => setShowExitDialog(false), className: "font-sans text-sm py-2 px-5", style: { border: '1px solid var(--border)', color: 'var(--foreground)', borderRadius: '2px' } }, "Keep Learning")))))));
}

// ResultsPage.js
function ResultsPage() {
    const navigate = go;
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const isRetryResults = params.get('mode') === 'retry';
    const { quizAnswers, retryAnswers, firstScore, correctedScore, setPhase } = learning;
    const displayScore = isRetryResults ? correctedScore : firstScore;
    const passed = (displayScore ?? 0) >= 85;
    const correct = quizAnswers.filter(a => a.isCorrect).length;
    function handleRetry() {
        setPhase('retry');
        navigate('/course/retry');
    }
    function handleRolePlay() {
        setPhase('roleplay');
        navigate('/course/roleplay');
    }
    return (html("div", { className: "min-h-screen", style: { background: 'var(--background)' } },
        html(NavBar, null),
        html("div", { className: "pt-14 max-w-2xl mx-auto px-6 py-10" },
            html("div", { className: "text-center mb-10 py-10 px-6", style: { background: passed ? 'rgba(122,78,45,0.08)' : 'rgba(200,80,60,0.06)', borderRadius: '2px', border: `1px solid ${passed ? 'var(--primary)' : 'rgba(200,80,60,0.25)'}` } },
                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-4", style: { color: 'var(--muted-foreground)', letterSpacing: '0.14em' } }, isRetryResults ? 'Corrected Score' : 'Your Score'),
                html("p", { className: "font-serif font-light mb-2", style: { fontSize: '5rem', color: passed ? 'var(--accent)' : 'var(--foreground)', lineHeight: 1 } },
                    displayScore ?? 0,
                    "%"),
                html("p", { className: "font-sans text-sm mb-1", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, isRetryResults
                    ? `${quizAnswers.filter(a => a.isCorrect).length + retryAnswers.filter(a => a.isCorrect).length} of 8 correct`
                    : `${correct} of 8 correct`),
                html("div", { className: "inline-flex items-center gap-2 mt-3 px-4 py-2 font-sans text-xs uppercase tracking-widest", style: {
                        background: passed ? 'var(--accent)' : 'var(--muted)',
                        color: passed ? 'var(--background)' : 'var(--muted-foreground)',
                        borderRadius: '2px',
                        letterSpacing: '0.14em',
                    } }, passed ? '✓ Passed — 85% or above' : '✗ Below passing grade (85%)'),
                isRetryResults && (html("div", { className: "mt-4 pt-4", style: { borderTop: '1px solid var(--border)' } },
                    html("p", { className: "font-sans text-xs", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                        "First attempt: ",
                        html("strong", { style: { fontWeight: 500 } },
                            firstScore,
                            "%"),
                        " \u00B7 Corrected: ",
                        html("strong", { style: { fontWeight: 500 } },
                            correctedScore,
                            "%"))))),
            !passed && !isRetryResults && (html("div", { className: "mb-6 p-5", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                html("p", { className: "font-sans text-sm leading-relaxed", style: { color: 'var(--foreground)', fontWeight: 300 } }, "You haven't reached the 85% passing grade yet. Review the feedback below, then retry only the questions you missed \u2014 you have one more attempt."))),
            isRetryResults && !passed && (html("div", { className: "mb-6 p-5", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                html("p", { className: "font-sans text-sm leading-relaxed", style: { color: 'var(--foreground)', fontWeight: 300 } }, "You haven't reached 85% after your retry, but you can still continue to the role-play practice. Your scores have been recorded accurately."))),
            html("div", { className: "mb-8" },
                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-5", style: { color: 'var(--muted-foreground)', letterSpacing: '0.14em' } }, "Question-by-Question Review"),
                html("div", { className: "space-y-4" }, QUIZ_QUESTIONS.map((q, i) => {
                    const firstAnswer = quizAnswers.find(a => a.questionIndex === i);
                    const retryAnswer = retryAnswers.find(a => a.questionIndex === i);
                    const wasRetried = quizAnswers.find(a => a.questionIndex === i && !a.isCorrect) && retryAnswers.some(a => a.questionIndex === i);
                    const finalCorrect = retryAnswer ? retryAnswer.isCorrect : firstAnswer?.isCorrect ?? false;
                    if (!firstAnswer)
                        return null;
                    return (html("div", { key: q.id, className: "p-5", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                        html("div", { className: "flex items-start gap-3 mb-3" },
                            html("span", { className: "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-sans", style: { background: finalCorrect ? 'var(--accent)' : 'rgba(200,80,60,0.15)', color: finalCorrect ? 'var(--background)' : 'rgba(200,80,60,0.8)', fontSize: '0.6rem', fontWeight: 700 } }, finalCorrect ? '✓' : '✗'),
                            html("p", { className: "font-sans text-sm leading-snug", style: { color: 'var(--foreground)', fontWeight: 400 } },
                                "Q",
                                q.id,
                                ": ",
                                q.question)),
                        html("div", { className: "pl-8 space-y-1" },
                            html("p", { className: "font-sans text-xs", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                                html("span", { style: { fontWeight: 500, color: 'var(--foreground)' } }, "You answered:"),
                                " ",
                                q.options[firstAnswer.selectedOption],
                                retryAnswer && html("span", null,
                                    " \u2192 ",
                                    q.options[retryAnswer.selectedOption],
                                    " (retry)")),
                            !firstAnswer.isCorrect && (html("p", { className: "font-sans text-xs", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                                html("span", { style: { fontWeight: 500, color: 'var(--foreground)' } }, "Correct answer:"),
                                " ",
                                q.options[q.correctIndex])),
                            html("p", { className: "font-sans text-xs mt-2 leading-relaxed", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, q.explanation))));
                }))),
            html("div", { className: "flex flex-col sm:flex-row gap-3" },
                !passed && !isRetryResults && (html("button", { onClick: handleRetry, className: "font-sans text-sm py-3 px-8 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.06em' } }, "Retry Missed Questions \u2192")),
                (passed || isRetryResults) && (html("button", { onClick: handleRolePlay, className: "font-sans text-sm py-3 px-8 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.06em' } }, "Continue to Role-Play \u2192"))))));
}

// RolePlayPage.js
function RolePlayPage() {
    const navigate = go;
    const { addRolePlayRound, setPhase } = learning;
    const round = pageValue('RolePlayPage', 'round', () => (0));
    const setRound = value => changePage('RolePlayPage', 'round', value);
    const started = pageValue('RolePlayPage', 'started', () => (false));
    const setStarted = value => changePage('RolePlayPage', 'started', value);
    const messages = pageValue('RolePlayPage', 'messages', () => ([]));
    const setMessages = value => changePage('RolePlayPage', 'messages', value);
    const inputText = pageValue('RolePlayPage', 'inputText', () => (''));
    const setInputText = value => changePage('RolePlayPage', 'inputText', value);
    const waitingForResponse = pageValue('RolePlayPage', 'waitingForResponse', () => (false));
    const setWaitingForResponse = value => changePage('RolePlayPage', 'waitingForResponse', value);
    const hintsUsed = pageValue('RolePlayPage', 'hintsUsed', () => (0));
    const setHintsUsed = value => changePage('RolePlayPage', 'hintsUsed', value);
    const showExitDialog = pageValue('RolePlayPage', 'showExitDialog', () => (false));
    const setShowExitDialog = value => changePage('RolePlayPage', 'showExitDialog', value);
    const showHint = pageValue('RolePlayPage', 'showHint', () => (false));
    const setShowHint = value => changePage('RolePlayPage', 'showHint', value);
    const bottomRef = { current: null };
    function handleStart() {
        setStarted(true);
        setRound(1);
        setMessages([{ from: 'avatar', text: AVATAR_OPENERS[0] }]);
    }
    function isValid(text) {
        const trimmed = text.trim();
        if (!trimmed || trimmed.length < 5)
            return false;
        if (/^[^a-zA-Z]*$/.test(trimmed))
            return false;
        return true;
    }
    function handleSend() {
        if (!isValid(inputText) || waitingForResponse)
            return;
        const userText = inputText.trim();
        setInputText('');
        setShowHint(false);
        // Add user message
        setMessages(prev => [...prev, { from: 'user', text: userText }]);
        setWaitingForResponse(true);
        // Simulate avatar response after delay
        setTimeout(() => {
            const avatarResponse = AVATAR_ROUND_RESPONSES[round - 1] ?? "Thank you for that response.";
            addRolePlayRound({
                roundNumber: round,
                userText,
                avatarResponse,
                usedHint: showHint,
            });
            setMessages(prev => [...prev, { from: 'avatar', text: avatarResponse }]);
            setWaitingForResponse(false);
            if (round >= 3) {
                // Done with all rounds
                setTimeout(() => {
                    setRound(4); // signal completion
                }, 800);
            }
            else {
                setRound(r => r + 1);
            }
        }, 1400);
    }
    function handleUseHint() {
        setHintsUsed(h => h + 1);
        setShowHint(true);
        setMessages(prev => [...prev, { from: 'avatar', text: HINTS[round - 1], isHint: true }]);
    }
    function handleViewFeedback() {
        setPhase('feedback');
        navigate('/course/feedback');
    }
    const roundLabels = ['Understanding their experience', 'Asking what they need', 'Offering a concrete action'];
    return (html("div", { className: "min-h-screen flex flex-col", style: { background: 'var(--background)' } },
        html(NavBar, { onExit: () => setShowExitDialog(true) }),
        html("div", { className: "fixed top-14 left-0 right-0 z-40 px-6 py-3", style: { background: 'var(--foreground)', borderBottom: '1px solid rgba(244,239,230,0.08)' } },
            html("div", { className: "max-w-2xl mx-auto flex items-center justify-between" },
                html("div", null,
                    html("p", { className: "font-sans text-xs uppercase tracking-widest", style: { color: 'rgba(244,239,230,0.45)', letterSpacing: '0.14em' } }, "Role-Play Practice"),
                    started && round <= 3 && (html("p", { className: "font-sans text-xs mt-0.5", style: { color: 'rgba(244,239,230,0.6)', fontWeight: 300 } },
                        "Round ",
                        round,
                        " of 3 \u00B7 ",
                        roundLabels[round - 1]))),
                started && (html("div", { className: "flex gap-1" }, [1, 2, 3].map(r => (html("div", { key: r, className: "w-8 h-1 rounded", style: { background: r <= round - 1 || round > 3 ? 'var(--accent)' : r === round ? 'var(--primary)' : 'rgba(244,239,230,0.15)' } }))))))),
        html("div", { className: "flex-1 pt-28 pb-4" }, !started ? (
        /* Start screen */
        html("div", { className: "max-w-2xl mx-auto px-6 py-6" },
            html("div", { className: "p-8 mb-6", style: { background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } },
                html("p", { className: "font-sans text-xs uppercase tracking-widest mb-4", style: { color: 'var(--accent)', letterSpacing: '0.14em' } }, "Scenario"),
                html("h2", { className: "font-serif text-xl font-light mb-3", style: { color: 'var(--foreground)' } }, ROLE_PLAY_SCENARIO.title),
                html("p", { className: "font-sans text-sm leading-relaxed mb-6", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, ROLE_PLAY_SCENARIO.context),
                html("div", { className: "pt-4", style: { borderTop: '1px solid var(--border)' } },
                    html("p", { className: "font-sans text-xs uppercase tracking-widest mb-3", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "Your goal"),
                    html("div", { className: "space-y-2" }, roundLabels.map((label, i) => (html("div", { key: label, className: "flex items-center gap-3" },
                        html("span", { className: "font-sans text-xs w-4", style: { color: 'var(--accent)', fontWeight: 600 } }, i + 1),
                        html("span", { className: "font-sans text-sm", style: { color: 'var(--foreground)', fontWeight: 300 } }, label))))))),
            html("button", { onClick: handleStart, className: "font-sans text-sm py-3 px-8 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.06em' } }, "Start Practice \u2192"))) : (
        /* Chat interface */
        html("div", { className: "max-w-2xl mx-auto px-5 flex flex-col h-full" },
            html("div", { className: "mb-4 flex items-center gap-2" },
                html("div", { className: "w-8 h-8 rounded-full flex items-center justify-center text-sm", style: { background: 'var(--foreground)' } }, "◇"),
                html("span", { className: "font-sans text-xs", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, ROLE_PLAY_SCENARIO.avatarRole)),
            html("div", { className: "space-y-4 mb-4 flex-1" },
                messages.map((msg, i) => (html("div", { key: i, className: `flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}` }, msg.isHint ? (html("div", { className: "max-w-xs px-4 py-3 font-sans text-xs leading-relaxed", style: { background: 'var(--muted)', color: 'var(--muted-foreground)', borderRadius: '2px', border: '1px dashed var(--border)', fontStyle: 'italic', fontWeight: 300 } },
                    "Hint: ",
                    msg.text)) : (html("div", { className: "max-w-sm px-4 py-3 font-sans text-sm leading-relaxed", style: {
                        background: msg.from === 'avatar' ? 'var(--card)' : 'var(--foreground)',
                        color: msg.from === 'avatar' ? 'var(--foreground)' : 'var(--background)',
                        borderRadius: '2px',
                        border: msg.from === 'avatar' ? '1px solid var(--border)' : 'none',
                        fontWeight: 300,
                    } }, msg.text))))),
                waitingForResponse && (html("div", { className: "flex justify-start" },
                    html("div", { className: "px-4 py-3 font-sans text-xs", style: { background: 'var(--card)', color: 'var(--muted-foreground)', borderRadius: '2px', border: '1px solid var(--border)' } },
                        html("span", { className: "animate-pulse" }, "\u00B7\u00B7\u00B7")))),
                round > 3 && (html("div", { className: "flex justify-center" },
                    html("div", { className: "px-4 py-3 font-sans text-xs text-center", style: { color: 'var(--muted-foreground)', background: 'var(--card)', borderRadius: '2px', border: '1px solid var(--border)' } }, "Practice complete \u2014 3 of 3 rounds"))),
                html("div", { ref: bottomRef })),
            round > 0 && round <= 3 && !waitingForResponse && (html("div", { className: "sticky bottom-4" },
                html("div", { className: "mb-2 flex items-center justify-between" },
                    html("p", { className: "font-sans text-xs", style: { color: 'var(--muted-foreground)', fontWeight: 300 } },
                        "Round ",
                        round,
                        ": ",
                        roundLabels[round - 1]),
                    !showHint && (html("button", { onClick: handleUseHint, className: "font-sans text-xs transition-opacity hover:opacity-70", style: { color: 'var(--accent)', fontWeight: 400 } }, "Need a hint?"))),
                html("div", { className: "flex gap-2" },
                    html("textarea", { value: inputText, onChange: e => setInputText(e.target.value), onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        } }, placeholder: "Type your response\u2026", rows: 3, className: "flex-1 font-sans text-sm px-4 py-3 resize-none outline-none", style: { background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '2px', color: 'var(--foreground)', fontWeight: 300 }, onFocus: e => (e.target.style.borderColor = 'var(--accent)'), onBlur: e => (e.target.style.borderColor = 'var(--border)') }),
                    html("button", { onClick: handleSend, disabled: !isValid(inputText), className: "px-4 py-3 self-end font-sans text-sm transition-opacity", style: { background: isValid(inputText) ? 'var(--foreground)' : 'var(--muted)', color: isValid(inputText) ? 'var(--background)' : 'var(--muted-foreground)', borderRadius: '2px', fontWeight: 500, opacity: isValid(inputText) ? 1 : 0.5, cursor: isValid(inputText) ? 'pointer' : 'not-allowed' } }, "Send")))),
            round > 3 && (html("div", { className: "sticky bottom-4" },
                html("button", { onClick: handleViewFeedback, className: "w-full font-sans text-sm py-4 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.06em' } }, "View Feedback \u2192")))))),
        showExitDialog && (html("div", { className: "fixed inset-0 z-50 flex items-center justify-center px-6", style: { background: 'rgba(38,26,15,0.6)' } },
            html("div", { className: "max-w-sm w-full p-8", style: { background: 'var(--background)', borderRadius: '2px' } },
                html("h3", { className: "font-serif text-xl font-light mb-3", style: { color: 'var(--foreground)' } }, "Leave this session?"),
                html("p", { className: "font-sans text-sm leading-relaxed mb-6", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Your conversation progress will be saved."),
                html("div", { className: "flex gap-3" },
                    html("button", { onClick: () => navigate('/portal'), className: "font-sans text-sm py-2 px-5", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500 } }, "Save and Leave"),
                    html("button", { onClick: () => setShowExitDialog(false), className: "font-sans text-sm py-2 px-5", style: { border: '1px solid var(--border)', color: 'var(--foreground)', borderRadius: '2px' } }, "Keep Practicing")))))));
}

// VideoPage.js
function VideoPage() {
    const navigate = go;
    const { setVideoCompleted, videoCompleted, setPhase, soundEnabled, setSoundEnabled } = learning;
    const playing = pageValue('VideoPage', 'playing', () => (false));
    const setPlaying = value => changePage('VideoPage', 'playing', value);
    const progress = pageValue('VideoPage', 'progress', () => (0));
    const setProgress = value => changePage('VideoPage', 'progress', value);
    const maxProgress = pageValue('VideoPage', 'maxProgress', () => (0));
    const setMaxProgress = value => changePage('VideoPage', 'maxProgress', value);
    const loadError = pageValue('VideoPage', 'loadError', () => (false));
    const setLoadError = value => changePage('VideoPage', 'loadError', value);
    const showExitDialog = pageValue('VideoPage', 'showExitDialog', () => (false));
    const setShowExitDialog = value => changePage('VideoPage', 'showExitDialog', value);
    const intervalRef = { current: null };
    const DURATION = 180;
    function handleSeek(e) {
        if (!videoCompleted)
            return; // can't skip forward on first watch
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const target = Math.floor(ratio * DURATION);
        if (target <= maxProgress || videoCompleted) {
            setProgress(target);
        }
    }
    function handleProgressBarClick(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const target = Math.floor(ratio * DURATION);
        if (target <= maxProgress || videoCompleted) {
            setProgress(target);
        }
    }
    function formatTime(s) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }
    function handleContinue() {
        setPhase('quiz');
        navigate('/course/quiz');
    }
    function handleExit() {
        setShowExitDialog(true);
        setPlaying(false);
    }
    return (html("div", { className: "min-h-screen", style: { background: 'var(--background)' } },
        html(NavBar, { onExit: handleExit }),
        html("div", { className: "pt-14" },
            html("div", { className: "px-6 py-4 flex items-center gap-4", style: { background: 'var(--card)', borderBottom: '1px solid var(--border)' } },
                html("span", { className: "font-sans text-xs uppercase tracking-widest", style: { color: 'var(--muted-foreground)', letterSpacing: '0.12em' } }, "Video"),
                html("div", { className: "flex-1 h-1 rounded", style: { background: 'var(--muted)' } },
                    html("div", { className: "h-1 rounded transition-all", style: { width: `${(progress / DURATION) * 100}%`, background: 'var(--accent)' } })),
                html("button", { onClick: () => setSoundEnabled(!soundEnabled), className: "font-sans text-xs", style: { color: 'var(--muted-foreground)' } }, soundEnabled ? '🔊' : '🔇')),
            html("div", { className: "max-w-3xl mx-auto px-6 py-8" },
                html("h2", { className: "font-serif text-2xl font-light mb-2", style: { color: 'var(--foreground)' } }, "Basic DEI \u2014 Introduction"),
            html("p", { className: "font-sans text-sm mb-8", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Watch the complete video before moving to practice questions. Prototype: simulated 3-minute lesson at 5× speed; no teaching video or audio is provided."),
                html("div", { className: "relative aspect-video mb-6 flex items-center justify-center cursor-pointer select-none", style: { background: 'var(--foreground)', borderRadius: '2px' }, onClick: () => !loadError && setPlaying(p => !p) },
                    html("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-4" },
                        !playing && progress === 0 && (html(fragment, null,
                            html("div", { className: "w-16 h-16 rounded-full flex items-center justify-center", style: { background: 'rgba(184,106,59,0.9)' } },
                                html("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none" },
                                    html("polygon", { points: "8,5 19,12 8,19", fill: "#F4EFE6" }))),
                            html("p", { className: "font-sans text-sm", style: { color: 'rgba(244,239,230,0.6)' } }, "Click to begin"))),
                        playing && (html("div", { className: "flex flex-col items-center gap-3" },
                            html("div", { className: "w-12 h-12 rounded-full flex items-center justify-center", style: { background: 'rgba(244,239,230,0.1)' } },
                                html("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none" },
                                    html("rect", { x: "3", y: "2", width: "3", height: "12", fill: "#F4EFE6" }),
                                    html("rect", { x: "10", y: "2", width: "3", height: "12", fill: "#F4EFE6" }))),
                            html("p", { className: "font-sans text-sm italic font-light", style: { color: 'rgba(244,239,230,0.55)' } },
                                "\"Diversity is being invited to the party.",
                                html("br", null),
                                "Inclusion is being asked to dance.\""),
                            html("p", { className: "font-sans text-xs", style: { color: 'rgba(244,239,230,0.3)' } }, "\u2014 Vern\u0101 Myers"))),
                        !playing && progress > 0 && progress < DURATION && (html("div", { className: "w-12 h-12 rounded-full flex items-center justify-center", style: { background: 'rgba(184,106,59,0.9)' } },
                            html("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none" },
                                html("polygon", { points: "8,5 19,12 8,19", fill: "#F4EFE6" })))),
                        progress >= DURATION && (html("div", { className: "flex flex-col items-center gap-3" },
                            html("div", { className: "w-12 h-12 rounded-full flex items-center justify-center", style: { background: 'var(--accent)' } },
                                html("svg", { width: "20", height: "20", viewBox: "0 0 20 20", fill: "none" },
                                    html("path", { d: "M4 10L8.5 14.5L16 6", stroke: "#F4EFE6", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }))),
                            html("p", { className: "font-sans text-sm", style: { color: 'rgba(244,239,230,0.7)' } }, "Video complete")))),
                    html("div", { className: "absolute bottom-3 right-4 font-sans text-xs", style: { color: 'rgba(244,239,230,0.45)' } },
                        formatTime(progress),
                        " / ",
                        formatTime(DURATION))),
                html("div", { className: "h-2 mb-2 cursor-pointer relative", style: { background: 'var(--muted)', borderRadius: '1px' }, onClick: handleProgressBarClick },
                    html("div", { className: "absolute top-0 left-0 h-2 transition-all", style: { width: `${(maxProgress / DURATION) * 100}%`, background: 'var(--secondary)', borderRadius: '1px' } }),
                    html("div", { className: "absolute top-0 left-0 h-2 transition-all", style: { width: `${(progress / DURATION) * 100}%`, background: 'var(--accent)', borderRadius: '1px' } })),
                !videoCompleted && (html("p", { className: "font-sans text-xs mb-6", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "You can replay watched sections. Skipping ahead is enabled after first full watch.")),
                videoCompleted && (html("div", { className: "mt-6" },
                    html("div", { className: "flex items-center gap-3 p-4 mb-6", style: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '2px' } },
                        html("span", { style: { color: 'var(--accent)' } }, "\u2713"),
                        html("p", { className: "font-sans text-sm", style: { color: 'var(--foreground)', fontWeight: 400 } }, "Viewing complete. Ready to begin practice questions.")),
                    html("button", { onClick: handleContinue, className: "font-sans text-sm py-3 px-8 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500, letterSpacing: '0.06em' } }, "Continue to Practice \u2192"))))),
        showExitDialog && (html("div", { className: "fixed inset-0 z-50 flex items-center justify-center px-6", style: { background: 'rgba(38,26,15,0.6)' } },
            html("div", { className: "max-w-sm w-full p-8", style: { background: 'var(--background)', borderRadius: '2px' } },
                html("h3", { className: "font-serif text-xl font-light mb-3", style: { color: 'var(--foreground)' } }, "Leave this session?"),
                html("p", { className: "font-sans text-sm leading-relaxed mb-6", style: { color: 'var(--muted-foreground)', fontWeight: 300 } }, "Your progress will be saved. You can return to the portal and continue from where you left off."),
                html("div", { className: "flex gap-3" },
                    html("button", { onClick: () => navigate('/portal'), className: "font-sans text-sm py-2 px-5 transition-opacity hover:opacity-90", style: { background: 'var(--foreground)', color: 'var(--background)', borderRadius: '2px', fontWeight: 500 } }, "Save and Leave"),
                    html("button", { onClick: () => setShowExitDialog(false), className: "font-sans text-sm py-2 px-5 transition-opacity hover:opacity-70", style: { border: '1px solid var(--border)', color: 'var(--foreground)', borderRadius: '2px' } }, "Keep Learning")))))));
}


// The original prototype uses a 180-second simulated lesson at 5x speed.
setInterval(() => {
  const video = state.pages.VideoPage;
  if (currentPath() !== '/course/video' || document.hidden || !video?.playing) return;
  const progress = Math.min(video.progress + 1, 180);
  video.progress = progress;
  video.maxProgress = Math.max(video.maxProgress, progress);
  if (progress === 180) { video.playing = false; state.videoCompleted = true; }
  try { persist(); } catch (_) { video.playing = false; }
  scheduleRender();
}, 200);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.pages.VideoPage) {
    state.pages.VideoPage.playing = false;
    try { persist(); } catch (_) {} scheduleRender();
  }
});
window.addEventListener('hashchange', () => {
  if (state.pages.VideoPage) state.pages.VideoPage.playing = false;
  scheduleRender();
});
// Resume an interrupted local, scripted response without duplicating a round.
const chat = state.pages.RolePlayPage;
if (chat?.waitingForResponse) {
  const userText = [...chat.messages].reverse().find(m => m.from === 'user')?.text;
  const avatarResponse = AVATAR_ROUND_RESPONSES[chat.round - 1];
  if (userText && avatarResponse && !state.rolePlays.some(r => r.roundNumber === chat.round)) {
    state.rolePlays.push({roundNumber:chat.round,userText,avatarResponse,usedHint:chat.showHint});
    chat.messages.push({from:'avatar',text:avatarResponse});
  }
  chat.round = Math.min(state.rolePlays.length + 1, 4);
  chat.waitingForResponse = false;
}
if (state.pages.VideoPage) state.pages.VideoPage.playing = false;
for (const [pageName, answerKey] of [['QuizPage','quizAnswers'],['RetryPage','retryAnswers']]) {
  const page = state.pages[pageName];
  if (!page) continue;
  const questions = pageName === 'RetryPage'
    ? QUIZ_QUESTIONS.filter(q => state.quizAnswers.some(a => a.questionIndex === q.id - 1 && !a.isCorrect))
    : QUIZ_QUESTIONS;
  const answer = state[answerKey].find(a => a.questionIndex === questions[page.currentIdx]?.id - 1);
  if (answer) { page.selected = answer.selectedOption; page.submitted = true; }
}
render();
