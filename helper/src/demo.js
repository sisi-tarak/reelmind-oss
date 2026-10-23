// Demo mode: no downloads, no AI calls, no key needed.
// Every reel gets realistic sample notes so you can try the whole app safely.
import { normalizeAnalysis, normalizeAssets } from './prompt.js';

const T = [
  {
    title: 'Build a RAG chatbot over your PDFs',
    summary:
      'Shows how retrieval-augmented generation lets a chatbot answer from your own documents. PDFs are split into chunks, turned into embeddings and stored in a vector database. At question time the closest chunks are retrieved and passed to the model as context.',
    keyPoints: ['Split documents into 500-1,000 token chunks with overlap', 'Store embeddings in a vector database such as Chroma', 'Retrieve the top 3-5 chunks for each question', 'Pass retrieved chunks to the model as context', 'Cite the source chunk in every answer'],
    topics: ['rag', 'vector databases', 'llm apps'],
    primaryTopic: 'rag',
    contentType: 'tutorial',
    difficulty: 'intermediate',
    practiceTask: { title: 'Chat with one PDF', steps: ['Install the packages', 'Load a PDF and split it into chunks', 'Embed the chunks into Chroma', 'Ask three questions and check the sources'], code: 'pip install chromadb pypdf sentence-transformers', language: 'bash' },
    tools: [{ name: 'Chroma', kind: 'library', url: 'https://www.trychroma.com', note: 'Local vector database for the chunks.' }, { name: 'LangChain', kind: 'library', url: 'https://www.langchain.com', note: 'Splits documents and wires the retrieval chain.' }],
    infographic: { layout: 'steps', headline: 'Retrieval turns your files into model context', center: '', items: [{ label: 'Chunk', detail: 'Split PDFs into overlapping pieces' }, { label: 'Embed', detail: 'Turn each chunk into a vector' }, { label: 'Retrieve', detail: 'Find the closest chunks to the question' }, { label: 'Answer', detail: 'Model replies using only those chunks' }], columns: [], rows: [] },
  },
  {
    title: 'Vector databases compared for small projects',
    summary: 'Compares three popular vector databases for a first AI project. Chroma is easiest to start locally, pgvector fits if you already run Postgres, and Pinecone is fully managed for scale.',
    keyPoints: ['Start local with Chroma for prototypes', 'Use pgvector to keep data next to your app tables', 'Pick a managed service only when you outgrow one machine'],
    topics: ['vector databases', 'rag', 'ai agents'],
    primaryTopic: 'rag',
    contentType: 'tool',
    difficulty: 'beginner',
    practiceTask: { title: 'Run the same search on two databases', steps: ['Embed 50 short notes', 'Load them into Chroma and pgvector', 'Run the same 5 queries on both', 'Compare speed and results'], code: 'docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev pgvector/pgvector:pg16', language: 'bash' },
    tools: [{ name: 'Chroma', kind: 'library', url: 'https://www.trychroma.com', note: 'Local, zero setup.' }, { name: 'pgvector', kind: 'library', url: 'https://github.com/pgvector/pgvector', note: 'Vector search inside Postgres.' }, { name: 'Pinecone', kind: 'tool', url: 'https://www.pinecone.io', note: 'Managed vector database.' }],
    infographic: { layout: 'comparison', headline: 'Start local, scale only when you need to', center: '', items: [], columns: ['Chroma', 'pgvector', 'Pinecone'], rows: [{ aspect: 'Setup', values: ['pip install', 'Postgres extension', 'Cloud account'] }, { aspect: 'Best for', values: ['Prototypes', 'Existing Postgres apps', 'Large scale'] }, { aspect: 'Cost', values: ['Free', 'Free', 'Free tier, then paid'] }] },
  },
  {
    title: 'Build an AI agent that uses tools',
    summary: 'Explains the agent loop: the model reads a goal, decides which tool to call, reads the result and repeats until done. The demo agent searches the web and writes a short report.',
    keyPoints: ['An agent is a loop of think, act, observe', 'Describe each tool with a clear name and input schema', 'Cap the number of steps to control cost', 'Log every tool call to debug the agent'],
    topics: ['ai agents', 'tool calling'],
    primaryTopic: 'ai agents',
    contentType: 'tutorial',
    difficulty: 'intermediate',
    practiceTask: { title: 'A two-tool research agent', steps: ['Define a search tool and a write-file tool', 'Write the loop with a 6-step cap', 'Give it one research question', 'Read the log and fix one bad tool description'], code: 'npm install @anthropic-ai/sdk', language: 'bash' },
    tools: [{ name: 'Claude API', kind: 'tool', url: 'https://docs.claude.com', note: 'Model with tool calling.' }],
    infographic: { layout: 'concept', headline: 'An agent is a loop, not a single prompt', center: 'Agent loop', items: [{ label: 'Goal', detail: 'What the user wants done' }, { label: 'Think', detail: 'Model picks the next tool' }, { label: 'Act', detail: 'Tool runs with model inputs' }, { label: 'Observe', detail: 'Result goes back to the model' }], columns: [], rows: [] },
  },
  {
    title: 'n8n workflow that answers WhatsApp leads',
    summary: 'Builds a no-code automation in n8n that receives WhatsApp messages, classifies them with an AI node and replies or forwards hot leads to a Google Sheet.',
    keyPoints: ['Trigger the workflow from a WhatsApp webhook', 'Use an AI node to classify the message', 'Route hot leads to a sheet and a Slack alert', 'Reply automatically to common questions'],
    topics: ['ai agents', 'automation', 'n8n'],
    primaryTopic: 'ai agents',
    contentType: 'tutorial',
    difficulty: 'beginner',
    practiceTask: { title: 'Lead router in n8n', steps: ['Run n8n locally with Docker', 'Add a webhook trigger', 'Add an AI classify node', 'Send hot leads to a Google Sheet'], code: 'docker run -it --rm -p 5678:5678 n8nio/n8n', language: 'bash' },
    tools: [{ name: 'n8n', kind: 'tool', url: 'https://n8n.io', note: 'Open source workflow automation.' }, { name: 'Claude API', kind: 'tool', url: 'https://docs.claude.com', note: 'Model used for the AI step.' }],
    infographic: { layout: 'steps', headline: 'Every message is sorted before a human sees it', center: '', items: [{ label: 'Message in', detail: 'WhatsApp webhook fires' }, { label: 'Classify', detail: 'AI tags it hot, warm or FAQ' }, { label: 'Route', detail: 'Hot leads go to sheet and Slack' }, { label: 'Reply', detail: 'FAQs get an instant answer' }], columns: [], rows: [] },
  },
  {
    title: 'Stop unnecessary re-renders in React',
    summary: 'Shows why components re-render and three fixes: move state down, memoize expensive children with React.memo, and keep callback identity stable with useCallback. Uses the React DevTools profiler to prove the gain.',
    keyPoints: ['A parent state change re-renders all children', 'Move state into the component that uses it', 'Wrap heavy children in React.memo', 'Measure with the Profiler before and after'],
    topics: ['react performance', 'react'],
    primaryTopic: 'react performance',
    contentType: 'tips',
    difficulty: 'intermediate',
    practiceTask: { title: 'Profile and fix one slow list', steps: ['Render a list of 2,000 rows with a search box', 'Record typing in the Profiler', 'Apply memo and move state down', 'Record again and compare'], code: 'const Row = React.memo(function Row({ item }) {\n  return <li>{item.name}</li>;\n});', language: 'javascript' },
    tools: [{ name: 'React DevTools', kind: 'tool', url: 'https://react.dev/learn/react-developer-tools', note: 'Profiler shows what re-rendered.' }],
    infographic: { layout: 'checklist', headline: 'Measure first, then cut re-renders', center: '', items: [{ label: 'Profile', detail: 'Record the slow interaction' }, { label: 'Move state down', detail: 'Keep state where it is used' }, { label: 'Memo children', detail: 'Wrap heavy rows in React.memo' }, { label: 'Stable callbacks', detail: 'useCallback for props passed down' }], columns: [], rows: [] },
  },
  {
    title: 'Five git commands that save you daily',
    summary: 'Quick tips for git: undo the last commit safely, stash work in progress, find the commit that broke something, rewrite messy commits before a PR, and recover lost work with reflog.',
    keyPoints: ['git reset --soft HEAD~1 undoes a commit but keeps changes', 'git stash saves unfinished work', 'git bisect finds the bad commit', 'git reflog recovers almost anything'],
    topics: ['git', 'developer tools'],
    primaryTopic: 'git',
    contentType: 'tips',
    difficulty: 'beginner',
    practiceTask: { title: 'Break and recover a repo', steps: ['Make 5 commits in a test repo', 'Undo one with reset --soft', 'Hard-reset by mistake', 'Recover it using reflog'], code: 'git reset --soft HEAD~1\ngit stash push -m "wip"\ngit reflog', language: 'bash' },
    tools: [{ name: 'git', kind: 'tool', url: 'https://git-scm.com', note: 'Version control.' }, { name: 'GitHub', kind: 'website', url: 'https://github.com', note: 'Hosts the repo.' }],
    infographic: { layout: 'checklist', headline: 'Almost nothing in git is truly lost', center: '', items: [{ label: 'reset --soft', detail: 'Undo commit, keep the changes' }, { label: 'stash', detail: 'Park unfinished work' }, { label: 'bisect', detail: 'Binary-search the bad commit' }, { label: 'reflog', detail: 'Find commits you thought were gone' }], columns: [], rows: [] },
  },
  {
    title: 'Prompt pattern for clean code reviews',
    summary: 'A reusable prompt that asks an AI model to review a diff for bugs first, then security, then readability, and to answer as a numbered list with file and line references.',
    keyPoints: ['Give the model a role and a review order', 'Paste the diff, not the whole repo', 'Ask for file and line for every finding', 'Ask it to say "no issues" rather than invent problems'],
    topics: ['prompting', 'code review', 'git'],
    primaryTopic: 'prompting',
    contentType: 'tips',
    difficulty: 'beginner',
    practiceTask: { title: 'Review your last PR with the prompt', steps: ['Copy the diff of your last pull request', 'Paste it under the prompt', 'Check each finding against the code', 'Note which findings were wrong'], code: 'Review this diff. Order: bugs, security, readability.\nFor each finding give file:line and a one-line fix.\nIf there are no issues in a category, say "none".', language: 'text' },
    tools: [{ name: 'Claude API', kind: 'tool', url: 'https://docs.claude.com', note: 'Model used for the AI step.' }],
    infographic: { layout: 'steps', headline: 'Order the review so real bugs come first', center: '', items: [{ label: 'Bugs', detail: 'Logic and edge cases' }, { label: 'Security', detail: 'Inputs, secrets, auth' }, { label: 'Readability', detail: 'Names and structure' }], columns: [], rows: [] },
  },
  {
    title: 'Deploy a React app free on Cloudflare Pages',
    summary: 'Walks through connecting a GitHub repo to Cloudflare Pages, setting the Vite build command and output folder, and adding a custom domain. Every push to main redeploys.',
    keyPoints: ['Connect the GitHub repo in the Pages dashboard', 'Build command npm run build, output dist', 'Preview deploys come free with every branch', 'Add a custom domain in two clicks'],
    topics: ['deployment', 'cloudflare'],
    primaryTopic: 'deployment',
    contentType: 'tutorial',
    difficulty: 'beginner',
    practiceTask: { title: 'Ship one side project', steps: ['Push a Vite app to GitHub', 'Create a Pages project from the repo', 'Set build command and output folder', 'Open the preview URL on your phone'], code: 'npm create vite@latest my-app -- --template react-ts', language: 'bash' },
    tools: [{ name: 'Cloudflare Pages', kind: 'tool', url: 'https://pages.cloudflare.com', note: 'Free static hosting with preview deploys.' }, { name: 'GitHub', kind: 'website', url: 'https://github.com', note: 'Hosts the repo.' }],
    infographic: { layout: 'steps', headline: 'Push to main and the site updates itself', center: '', items: [{ label: 'Push', detail: 'Code lands on GitHub' }, { label: 'Build', detail: 'Pages runs npm run build' }, { label: 'Deploy', detail: 'dist goes live on the edge' }], columns: [], rows: [] },
  },
  {
    title: 'Turn your commit routine into a Claude skill',
    summary: 'Shows how to package a repeatable task as a Claude skill: a folder with a SKILL.md file whose description tells Claude when to use it. The example skill writes conventional commit messages from a staged diff.',
    keyPoints: ['A skill is a folder with a SKILL.md file', 'The description decides when Claude uses the skill', 'Keep steps short and add one worked example', 'Upload the zipped folder in Claude settings'],
    topics: ['claude skills', 'prompting', 'git'],
    primaryTopic: 'claude skills',
    contentType: 'tutorial',
    difficulty: 'beginner',
    practiceTask: { title: 'Make and install one skill', steps: ['Create a folder called commit-message-writer', 'Write SKILL.md with name, description and steps', 'Zip the folder and upload it in Claude settings', 'Ask Claude to write a commit message for a diff'], code: '---\nname: commit-message-writer\ndescription: Writes conventional commit messages from a git diff.\n---', language: 'markdown' },
    tools: [{ name: 'Claude', kind: 'tool', url: 'https://claude.ai', note: 'Runs the skill.' }],
    infographic: { layout: 'steps', headline: 'A skill is instructions Claude loads only when needed', center: '', items: [{ label: 'Folder', detail: 'One folder per skill' }, { label: 'SKILL.md', detail: 'Name, description, steps' }, { label: 'Upload', detail: 'Zip it and add it in settings' }, { label: 'Use', detail: 'Claude picks it up by description' }], columns: [], rows: [] },
    skill: {
      name: 'commit-message-writer',
      description: 'Writes clear conventional commit messages from a staged git diff. Use when the user asks for a commit message or pastes a diff to commit.',
      instructions:
        '# Commit message writer\n\nWrite one commit message for the diff the user gives you.\n\n## Steps\n\n1. Read the whole diff and find the single main change.\n2. Pick a type: feat, fix, docs, refactor, test or chore.\n3. Write a subject line under 60 characters: `type(scope): what changed`, in the imperative mood.\n4. If the change needs explaining, add a blank line and up to three short bullet points saying why.\n\n## Rules\n\n- Never describe more than one change; suggest splitting the commit instead.\n- No trailing period in the subject.\n\n## Example\n\nDiff: renames `getUser` to `fetchUser` across the API client.\n\n```\nrefactor(api): rename getUser to fetchUser\n\n- Matches the naming of the other fetch helpers\n```',
    },
  },
  {
    title: 'How to answer "tell me about yourself"',
    summary: 'Gives a 60-second structure for the first interview question: present role, one proof project with a number, and why this company. Warns against reciting the resume.',
    keyPoints: ['Present, past, future in 60 seconds', 'Lead with one project and a measurable result', 'End with why this role fits'],
    topics: ['interviews', 'career'],
    primaryTopic: 'career',
    contentType: 'career',
    difficulty: 'beginner',
    practiceTask: { title: 'Record your 60-second answer', steps: ['Write it using the three parts', 'Record yourself on your phone', 'Cut anything that repeats your resume', 'Record again under 60 seconds'], code: '', language: '' },
    tools: [],
    infographic: { layout: 'steps', headline: 'Sixty seconds: now, proof, why here', center: '', items: [{ label: 'Now', detail: 'What you do today' }, { label: 'Proof', detail: 'One project with a number' }, { label: 'Why here', detail: 'Link it to this role' }], columns: [], rows: [] },
  },
];

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Turns a sentence into a fill-the-gap question by hiding its most telling word. */
export function cloze(sentence) {
  const words = sentence.split(/\s+/);
  let best = -1;
  words.forEach((w, i) => {
    const clean = w.replace(/[^\w.+-]/g, '');
    if (i > 0 && clean.length > 3 && (best < 0 || clean.length > words[best].replace(/[^\w.+-]/g, '').length)) best = i;
  });
  if (best < 0) return null;
  const answer = words[best].replace(/[.,;:!?]+$/, '');
  return { q: `Fill the gap: ${words.map((w, i) => (i === best ? '_____' : w)).join(' ')}`, a: answer };
}

export function demoFlashcards(a) {
  const cards = [{ q: `What is the main idea of "${a.title}"?`, a: a.summary.split('. ')[0].replace(/\.$/, '') + '.' }];
  for (const p of a.keyPoints.slice(0, 3)) {
    const c = cloze(p);
    if (c) cards.push(c);
  }
  return cards;
}

/** What a real analysis would find to reuse in a reel, made from the sample notes. */
export function demoAssets(a) {
  const task = a.practiceTask || {};
  const code = task.code || '';
  const automation = (a.topics || []).some((t) => ['automation', 'n8n'].includes(t));
  return normalizeAssets({
    skills: a.skill ? [a.skill] : [],
    prompts: task.language === 'text' && code ? [{ title: task.title, prompt: code, useFor: a.keyPoints?.[0] || a.title }] : [],
    snippets: code && task.language !== 'text' ? [{ title: task.title, language: task.language, code }] : [],
    workflows: automation ? [{ title: a.title, goal: a.summary.split('. ')[0], steps: (a.infographic?.items || []).map((i) => `${i.label}: ${i.detail}`), tools: (a.tools || []).map((t) => t.name) }] : [],
  });
}

/** `index` picks a template in order (used for the bundled samples); otherwise the shortcode decides. */
export function demoAnalysis(reel, index) {
  const base = T[(index ?? hash(reel.shortcode)) % T.length];
  return {
    ...normalizeAnalysis({ ...base, flashcards: demoFlashcards(base), assets: demoAssets(base), transcript: `(Demo) Sample spoken text for ${base.title.toLowerCase()}.`, onScreenText: '', language: 'English' }),
    model: 'demo',
    provider: 'demo',
  };
}

export const demoCreators = ['codewithsam', 'ai.with.anu', 'devtipsdaily', 'buildfast.in', 'telugutechbro', 'reactguru'];
export function demoInfo(reel) {
  return { caption: '(Demo caption)', creator: reel.creator || demoCreators[hash(reel.shortcode) % demoCreators.length], duration: 45 };
}
