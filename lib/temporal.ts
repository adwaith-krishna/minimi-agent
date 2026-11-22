/**
 * Temporal Context Engine
 * 
 * Provides precise temporal anchoring, relative date resolution (e.g. "Monday",
 * "last Tuesday", "3 November", "since then"), and temporal delta tracking.
 */

export interface TemporalContext {
  now: Date;
  isoDate: string; // YYYY-MM-DD
  fullDateTime: string;
  dayOfWeek: string;
  relativeDates: {
    today: string;
    yesterday: string;
    thisMonday: string;
    lastMonday: string;
    lastTuesday: string;
    lastWednesday: string;
    lastThursday: string;
    lastFriday: string;
    sevenDaysAgo: string;
    thirtyDaysAgo: string;
  };
}

export function getTemporalContext(referenceDate: Date = new Date()): TemporalContext {
  const now = referenceDate;
  const isoDate = now.toISOString().split('T')[0];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[now.getDay()];

  // Calculate day offsets
  const getOffsetDate = (offsetDays: number): string => {
    const d = new Date(now);
    d.setDate(d.getDate() - offsetDays);
    return d.toISOString().split('T')[0];
  };

  // Find most recent days of week
  const currentDayIndex = now.getDay(); // 0 is Sunday, 1 is Monday, etc.

  // Most recent Monday: if today is Monday (1), 0 or 7 days ago. If today is Sunday (0), 6 days ago.
  const daysSinceMonday = currentDayIndex >= 1 ? currentDayIndex - 1 : 6;
  const thisMonday = getOffsetDate(daysSinceMonday);
  const lastMonday = getOffsetDate(daysSinceMonday + 7);

  // Last Tuesday
  const daysSinceTuesday = currentDayIndex >= 2 ? currentDayIndex - 2 : currentDayIndex + 5;
  const lastTuesday = getOffsetDate(daysSinceTuesday === 0 ? 7 : daysSinceTuesday);

  // Last Wednesday
  const daysSinceWednesday = currentDayIndex >= 3 ? currentDayIndex - 3 : currentDayIndex + 4;
  const lastWednesday = getOffsetDate(daysSinceWednesday === 0 ? 7 : daysSinceWednesday);

  // Last Thursday
  const daysSinceThursday = currentDayIndex >= 4 ? currentDayIndex - 4 : currentDayIndex + 3;
  const lastThursday = getOffsetDate(daysSinceThursday === 0 ? 7 : daysSinceThursday);

  // Last Friday
  const daysSinceFriday = currentDayIndex >= 5 ? currentDayIndex - 5 : currentDayIndex + 2;
  const lastFriday = getOffsetDate(daysSinceFriday === 0 ? 7 : daysSinceFriday);

  return {
    now,
    isoDate,
    fullDateTime: now.toISOString(),
    dayOfWeek,
    relativeDates: {
      today: isoDate,
      yesterday: getOffsetDate(1),
      thisMonday,
      lastMonday,
      lastTuesday,
      lastWednesday,
      lastThursday,
      lastFriday,
      sevenDaysAgo: getOffsetDate(7),
      thirtyDaysAgo: getOffsetDate(30),
    },
  };
}

/**
 * Format a temporal system prompt section to anchor the agent in time.
 */
export function buildTemporalSystemPrompt(temporal: TemporalContext): string {
  return `### CURRENT TEMPORAL ANCHOR
- Current Date: ${temporal.isoDate} (${temporal.dayOfWeek})
- Current UTC Timestamp: ${temporal.fullDateTime}
- Relative Temporal Reference Map:
  * Today: ${temporal.relativeDates.today}
  * Yesterday: ${temporal.relativeDates.yesterday}
  * Most recent Monday ("On Monday"): ${temporal.relativeDates.thisMonday}
  * Last Tuesday ("Last Tuesday"): ${temporal.relativeDates.lastTuesday}
  * 7 days ago: ${temporal.relativeDates.sevenDaysAgo}
  * 30 days ago: ${temporal.relativeDates.thirtyDaysAgo}

IMPORTANT TEMPORAL INSTRUCTIONS:
1. When the user references relative dates like "On Monday", "Last Tuesday", "last week", or specific dates like "3 November", consult this reference map and the conversation history.
2. "Since then" means the interval between that anchor date and today (${temporal.isoDate}).
3. For pricing or product changes "since then", focus your web search on updates, changelogs, pricing modifications, or announcements published between that date and ${temporal.isoDate}.`;
}

/**
 * Parses user input for temporal keywords to aid in memory lookup and query planning.
 */
export function extractTemporalKeywords(input: string): {
  hasTemporalReference: boolean;
  terms: string[];
} {
  const temporalTerms = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'yesterday', 'today', 'last week', 'since', 'november', 'december', 'january',
    'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
    'earlier', 'previously', 'past', 'history'
  ];

  const lower = input.toLowerCase();
  const matched = temporalTerms.filter(term => lower.includes(term));

  return {
    hasTemporalReference: matched.length > 0,
    terms: matched,
  };
}
