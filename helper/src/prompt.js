// The analysis prompt and the JSON shape every reel is turned into.
// Change ANALYSIS_SCHEMA or the prompt => bump config.promptVersion.

const str = (description) => ({ type: 'string', description });

export const FLASHCARDS = {
  type: 'array',
  description: '3-5 review flashcards that test understanding, not trivia. Question on the front, short answer on the back.',
  items: {
    type: 'object',
    properties: {
      q: str('A specific question, max 20 words. Never ask about the creator or the video itself.'),
      a: str('The answer, max 30 words.'),
    },
    required: ['q', 'a'],
  },
};

export const ASSETS = {
  type: 'object',
  description: 'Reusable things the viewer can take from the reel and use directly. Every list may be empty; never invent content the reel does not show or clearly describe.',
  properties: {
    skills: {
      type: 'array',
      description:
        'Only when the reel shows, shares or teaches a Claude skill (an Agent Skill / SKILL.md) or a reusable procedure the creator presents for Claude or another AI agent to follow. Turn it into a complete, ready-to-use skill. Otherwise empty.',
      items: {
        type: 'object',
        properties: {
          name: str('Skill name: lowercase letters, numbers and hyphens, max 64 characters, e.g. "commit-message-writer".'),
          description: str('What the skill does and exactly when Claude should use it, in third person, max 300 characters.'),
          instructions: str('The body of SKILL.md in Markdown: a short overview, then numbered steps, rules and one worked example. Complete enough to use as is.'),
        },
        required: ['name', 'description', 'instructions'],
      },
    },
    prompts: {
      type: 'array',
      description: 'Prompts shown, spoken or described in the reel, written out in full and ready to paste. Mark parts to fill in as [like this]. Empty if none.',
      items: {
        type: 'object',
        properties: { title: str('Short name, 2-6 words.'), prompt: str('The full prompt text.'), useFor: str('When to use it, one sentence.') },
        required: ['title', 'prompt', 'useFor'],
      },
    },
    snippets: {
      type: 'array',
      description: 'Code, terminal commands or config shown in the reel, complete and runnable where possible. Empty if none.',
      items: {
        type: 'object',
        properties: { title: str('What it does, 2-8 words.'), language: str('e.g. "bash", "python", "javascript", "json", "yaml".'), code: str('The code.') },
        required: ['title', 'language', 'code'],
      },
    },
    workflows: {
      type: 'array',
      description: 'Automations or multi-step workflows the reel builds or explains (n8n, Zapier, Make, agents, CI pipelines). Empty if none.',
      items: {
        type: 'object',
        properties: {
          title: str('Short name.'),
          goal: str('What it achieves, one sentence.'),
          steps: { type: 'array', items: { type: 'string' }, description: 'Each node or step in order, with its key settings.' },
          tools: { type: 'array', items: { type: 'string' }, description: 'Apps and services it uses.' },
        },
        required: ['title', 'goal', 'steps', 'tools'],
      },
    },
  },
  required: ['skills', 'prompts', 'snippets', 'workflows'],
};

const RESERVED = /anthropic|claude/g;
/** Agent Skill names: lowercase, digits and hyphens, at most 64 characters, without reserved words. */
export function skillName(raw) {
  const name = String(raw || '')
    .toLowerCase()
    .replace(RESERVED, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return name || 'my-skill';
}

export function normalizeAssets(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    skills: arr(a.skills)
      .map((k) => ({ name: skillName(k?.name), description: s(k?.description).slice(0, 1024), instructions: s(k?.instructions) }))
      .filter((k) => k.description && k.instructions)
      .slice(0, 3),
    prompts: arr(a.prompts)
      .map((p) => ({ title: s(p?.title) || 'Prompt', prompt: s(p?.prompt), useFor: s(p?.useFor) }))
      .filter((p) => p.prompt)
      .slice(0, 6),
    snippets: arr(a.snippets)
      .map((c) => ({ title: s(c?.title) || 'Snippet', language: s(c?.language).toLowerCase() || 'text', code: s(c?.code) }))
      .filter((c) => c.code)
      .slice(0, 8),
    workflows: arr(a.workflows)
      .map((w) => ({ title: s(w?.title) || 'Workflow', goal: s(w?.goal), steps: arr(w?.steps).map(s).filter(Boolean), tools: arr(w?.tools).map(s).filter(Boolean) }))
      .filter((w) => w.steps.length)
      .slice(0, 3),
  };
}

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    title: str('A clear title for what the reel teaches, 4-10 words. Not clickbait.'),
    summary: str('What the reel teaches, in 3-5 plain sentences.'),
    keyPoints: { type: 'array', items: { type: 'string' }, description: '3-7 main ideas, each one short sentence.' },
    topics: {
      type: 'array',
      items: { type: 'string' },
      description: '1-4 short lowercase topic tags, most specific useful level, e.g. "rag", "react performance", "git".',
    },
    primaryTopic: str('The single best topic for grouping this reel with similar reels. Lowercase, 1-3 words, reusable across reels (e.g. "ai agents", not "my cool agent").'),
    contentType: { type: 'string', enum: ['tutorial', 'tool', 'tips', 'news', 'opinion', 'career', 'other'] },
    difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
    practiceTask: {
      type: 'object',
      description: 'One hands-on exercise the viewer can do in 10-45 minutes to apply what the reel teaches.',
      properties: {
        title: str('Short name of the exercise.'),
        steps: { type: 'array', items: { type: 'string' }, description: '3-8 concrete steps.' },
        code: str('Code, commands or a prompt to start from, if the reel is technical. Empty string otherwise.'),
        language: str('Language of the code block, e.g. "bash", "python", "javascript", "text". Empty if no code.'),
      },
      required: ['title', 'steps', 'code', 'language'],
    },
    tools: {
      type: 'array',
      description: 'Every tool, library, repo, website, course or prompt named or shown in the reel.',
      items: {
        type: 'object',
        properties: {
          name: str('Name as shown.'),
          kind: { type: 'string', enum: ['tool', 'library', 'repo', 'website', 'prompt', 'course', 'other'] },
          url: str('Official URL if known with confidence, else empty string. Never invent URLs.'),
          note: str('What it is used for in the reel, one short sentence.'),
        },
        required: ['name', 'kind', 'url', 'note'],
      },
    },
    infographic: {
      type: 'object',
      description:
        'Data for a one-glance visual summary. Pick the layout that fits best: "steps" for a process, "comparison" for options side by side, "concept" for one idea and its parts, "checklist" for tips.',
      properties: {
        layout: { type: 'string', enum: ['steps', 'comparison', 'concept', 'checklist'] },
        headline: str('The one-line takeaway the visual shows, max 12 words.'),
        center: str('For "concept": the core idea in 1-4 words. Empty otherwise.'),
        items: {
          type: 'array',
          description: 'For steps, concept and checklist: 3-6 items. Empty for comparison.',
          items: {
            type: 'object',
            properties: { label: str('1-5 words.'), detail: str('One short phrase, max 14 words.') },
            required: ['label', 'detail'],
          },
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'For comparison: the 2-3 options being compared. Empty otherwise.',
        },
        rows: {
          type: 'array',
          description: 'For comparison: 3-5 aspects. Empty otherwise.',
          items: {
            type: 'object',
            properties: {
              aspect: str('What is compared, 1-4 words.'),
              values: { type: 'array', items: { type: 'string' }, description: 'One short value per column, in column order.' },
            },
            required: ['aspect', 'values'],
          },
        },
      },
      required: ['layout', 'headline', 'center', 'items', 'columns', 'rows'],
    },
    flashcards: FLASHCARDS,
    assets: ASSETS,
    transcript: str('Everything spoken in the reel, in the original language. Empty string if nothing is spoken.'),
    onScreenText: str('Important text shown on screen (code, lists, commands), in reading order. Empty if none.'),
    language: str('Main spoken language, e.g. "English", "Telugu", "Hindi + English".'),
  },
  required: [
    'title',
    'summary',
    'keyPoints',
    'topics',
    'primaryTopic',
    'contentType',
    'difficulty',
    'practiceTask',
    'tools',
    'infographic',
    'flashcards',
    'assets',
    'transcript',
    'onScreenText',
    'language',
  ],
};

/**
 * @param {{ caption: string, creator: string, source: 'video'|'frames'|'caption', transcript?: string, onScreenText?: string }} input
 */
export function buildPrompt({ caption, creator, source, transcript = '', onScreenText = '' }) {
  const how = {
    video: 'Watch the whole video, listen to the speech and read the text on screen.',
    frames: 'You are given still frames taken across the video, in order. Read the text, code and diagrams on them. You cannot hear the audio, so use the earlier transcript below if there is one, and copy it into the transcript field unchanged.',
    caption: 'Only the caption is available for this post (the video could not be downloaded). Work from the caption alone and keep transcript empty.',
  }[source];
  const earlier = [
    transcript ? `Earlier transcript of the speech:\n${transcript.slice(0, 12000)}` : '',
    onScreenText ? `Earlier notes of text shown on screen:\n${onScreenText.slice(0, 4000)}` : '',
  ].filter(Boolean);
  return [
    'You turn a saved Instagram reel into study notes for someone who saves many technical reels and wants to remember and practise them.',
    how,
    'Write every field in clear, simple English, even when the reel is in another language. Only the transcript stays in the original language.',
    'Be specific: name the exact tools, commands, settings and numbers the reel uses. Do not add facts that are not in the reel, except to make the practice task runnable.',
    'If the reel is not educational (a meme, an ad), say so plainly in the summary and keep other fields short.',
    'In assets, capture what the viewer can reuse directly: prompts and code exactly as shown (completed where cut off), workflows step by step, and a full SKILL.md only when the reel is about a Claude or agent skill.',
    '',
    `Creator: ${creator || 'unknown'}`,
    `Caption: ${caption ? caption.slice(0, 4000) : '(none)'}`,
    ...earlier,
  ].join('\n');
}

/** The text that represents a reel's meaning for linking. */
export function embeddingText(a) {
  return [a.title, a.summary, a.keyPoints?.join('. '), `Topics: ${(a.topics || []).join(', ')}`, `Tools: ${(a.tools || []).map((t) => t.name).join(', ')}`]
    .filter(Boolean)
    .join('\n');
}

// Fills in anything the model left out, so the web app can always render a card.
export function normalizeAnalysis(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const arr = (v) => (Array.isArray(v) ? v : []);
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const info = a.infographic || {};
  const topics = arr(a.topics).map((t) => s(t).toLowerCase()).filter(Boolean).slice(0, 4);
  const primaryTopic = s(a.primaryTopic).toLowerCase() || topics[0] || 'unsorted';
  return {
    title: s(a.title) || 'Untitled reel',
    summary: s(a.summary),
    keyPoints: arr(a.keyPoints).map(s).filter(Boolean),
    topics: topics.length ? topics : [primaryTopic],
    primaryTopic,
    contentType: s(a.contentType) || 'other',
    difficulty: s(a.difficulty) || 'beginner',
    practiceTask: {
      title: s(a.practiceTask?.title),
      steps: arr(a.practiceTask?.steps).map(s).filter(Boolean),
      code: s(a.practiceTask?.code),
      language: s(a.practiceTask?.language),
    },
    tools: arr(a.tools)
      .map((t) => ({ name: s(t?.name), kind: s(t?.kind) || 'other', url: s(t?.url), note: s(t?.note) }))
      .filter((t) => t.name),
    infographic: {
      layout: ['steps', 'comparison', 'concept', 'checklist'].includes(info.layout) ? info.layout : 'checklist',
      headline: s(info.headline),
      center: s(info.center),
      items: arr(info.items).map((i) => ({ label: s(i?.label), detail: s(i?.detail) })).filter((i) => i.label),
      columns: arr(info.columns).map(s).filter(Boolean),
      rows: arr(info.rows).map((r) => ({ aspect: s(r?.aspect), values: arr(r?.values).map(s) })).filter((r) => r.aspect),
    },
    flashcards: arr(a.flashcards)
      .map((c) => ({ q: s(c?.q), a: s(c?.a) }))
      .filter((c) => c.q && c.a)
      .slice(0, 6),
    assets: normalizeAssets(a.assets),
    transcript: s(a.transcript),
    onScreenText: s(a.onScreenText),
    language: s(a.language),
  };
}
