// Colour carries meaning on the board, never decoration.
// A reel's colour comes from what kind of learning it is, chosen for the feeling that fits it.
import {
  Bookmark,
  BookOpen,
  Briefcase,
  Film,
  GitBranch,
  Globe,
  GraduationCap,
  Lightbulb,
  Link2,
  MessageCircle,
  MessageSquareText,
  Newspaper,
  Package,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface Mood {
  label: string;
  /** Strong colour: icons, wires, chips. */
  color: string;
  /** Pale wash: tile and sticky-note backgrounds. */
  tint: string;
  /** Border for sticky notes on that wash. */
  edge: string;
  feeling: string;
  icon: LucideIcon;
}

export const CONTENT_MOODS: Record<string, Mood> = {
  tutorial: {
    label: 'Tutorial',
    color: '#2563eb',
    tint: '#eef3ff',
    edge: '#c9d8fb',
    feeling: 'Calm blue for focus: sit down and learn it step by step',
    icon: GraduationCap,
  },
  tool: {
    label: 'Tool',
    color: '#0d9488',
    tint: '#ebf8f6',
    edge: '#bfe6e0',
    feeling: 'Fresh teal for discovery: something new to try',
    icon: Wrench,
  },
  tips: {
    label: 'Tips',
    color: '#d97706',
    tint: '#fff6e8',
    edge: '#f7dcae',
    feeling: 'Warm amber for quick wins: small and useful today',
    icon: Lightbulb,
  },
  news: {
    label: 'News',
    color: '#e5484d',
    tint: '#fff0f0',
    edge: '#f8cdd0',
    feeling: 'Coral for urgency: time-sensitive, check it soon',
    icon: Newspaper,
  },
  opinion: {
    label: 'Opinion',
    color: '#7c3aed',
    tint: '#f4efff',
    edge: '#dcccfb',
    feeling: 'Violet for reflection: a viewpoint to think over',
    icon: MessageCircle,
  },
  career: {
    label: 'Career',
    color: '#16a34a',
    tint: '#edf9f0',
    edge: '#c3eccd',
    feeling: 'Green for growth: moves your career forward',
    icon: Briefcase,
  },
  other: {
    label: 'Other',
    color: '#64748b',
    tint: '#f2f4f7',
    edge: '#d9dee6',
    feeling: 'Slate for neutral: not clearly a lesson',
    icon: Film,
  },
};

export function moodFor(contentType: string | undefined): Mood {
  return CONTENT_MOODS[contentType || 'other'] || CONTENT_MOODS.other;
}

/** States sit on top of the content colour and mean the same thing everywhere. */
export const STATE = {
  new: { color: '#facc15', label: 'New in your latest batch', feeling: 'Yellow highlighter: look at this first' },
  done: { color: '#16a34a', label: 'Practice done', feeling: 'Green check: you have tried it' },
  related: { color: '#8b5cf6', label: 'Related reel in another topic', feeling: 'Dashed violet wire: these connect' },
  tool: { color: '#98a2b3', label: 'Tool or link the reel uses', feeling: 'Grey: supporting detail, not a lesson' },
};

export const TOOL_ICONS: Record<string, LucideIcon> = {
  tool: Wrench,
  library: Package,
  repo: GitBranch,
  website: Globe,
  prompt: MessageSquareText,
  course: BookOpen,
  other: Link2,
};

export const RootIcon = Bookmark;
