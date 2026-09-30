import type { Club, Concept, RuleCheck } from "./types";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentionsWord(text: string, word: string) {
  const negated = new RegExp(`(no|not|without|inga?|utan|aldrig)\\s+(\\w+\\s+)?${escape(word)}\\b`, "i");
  const plain = new RegExp(`(^|[^\\p{L}])${escape(word)}($|[^\\p{L}])`, "iu");
  return plain.test(text) && !negated.test(text);
}

export function allowedPalette(club: Club, concept: Pick<Concept, "mode">) {
  const satire = concept.mode === "satir" && club.agent.satire.allowed;
  return satire ? [...club.palette, ...club.agent.satire.extraColors] : club.palette;
}

export function checkConcept(club: Club, concept: Concept): RuleCheck[] {
  const satire = concept.mode === "satir" && club.agent.satire.allowed;
  const allowed = new Set(allowedPalette(club, concept).map((c) => c.hex.toUpperCase()));
  const offPalette = concept.palette.filter((hex) => !allowed.has(hex.toUpperCase()));

  const text = `${concept.slogan} ${concept.story} ${concept.title}`;
  const banned = club.bannedWords.filter((w) => mentionsWord(text, w));

  const colorHits = satire
    ? []
    : club.forbiddenColors.filter((fc) => fc.words.some((w) => mentionsWord(`${concept.artDirection} ${concept.story}`, w)));
  const brand = club.kind === "brand";
  const rivalText = `${concept.artDirection} ${concept.story} ${concept.slogan}`;
  const rivalMarks = brand
    ? (club.competitors ?? []).some((c) => mentionsWord(rivalText, c))
    : /\b(aik|hammarby|gais|örgryte|malmö ff|mff|djurgården)\b.{0,20}\b(logo|logga|crest|sköld|emblem|badge|märke)/i.test(
    `${concept.artDirection} ${concept.story}`,
  );

  const logoHit = /\b(logo|logotype|crest|emblem|badge|sköld|klubbmärke|logga)\b/i.test(concept.artDirection)
    && !/\b(no|without|inga?|utan)\s+(\w+\s+)?(logo|logotype|crest|emblem|badge|sköld|klubbmärke)/i.test(concept.artDirection);

  return [
    {
      rule: brand ? `Endast ${club.name}s färger` : "Endast klubbens färger",
      ok: offPalette.length === 0,
      note: offPalette.length ? `Otillåtna färgkoder: ${offPalette.join(", ")}` : undefined,
    },
    {
      rule: satire ? "Satirläge: motståndarfärger tillåtna som skämt" : "Inga konkurrentfärger i motivet",
      ok: colorHits.length === 0,
      note: colorHits.length ? colorHits.map((c) => `${c.name}: ${c.reason}`).join("; ") : undefined,
    },
    {
      rule: brand ? "Inga konkurrenters namn eller loggor" : "Inga andra klubbars sköldar eller varumärken",
      ok: !rivalMarks,
      note: rivalMarks ? (brand ? "Texten nämner en konkurrent" : "Beskrivningen nämner en annan klubbs logga eller sköld") : undefined,
    },
    {
      rule: `Slogan max ${club.maxSloganLength} tecken`,
      ok: concept.slogan.length <= club.maxSloganLength,
      note: `${concept.slogan.length} tecken`,
    },
    {
      rule: "Ton: inga svordomar eller hat",
      ok: banned.length === 0,
      note: banned.length ? `Hittade: ${banned.join(", ")}` : undefined,
    },
    {
      rule: brand ? "AI ritar ingen logga" : "AI ritar ingen klubbsköld",
      ok: !logoHit,
      note: logoHit ? "Bildbeskrivningen nämner logga eller sköld" : undefined,
    },
  ];
}

export const passesAll = (checks: RuleCheck[]) => checks.every((c) => c.ok);
