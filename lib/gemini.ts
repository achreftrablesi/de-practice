import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export type Article = "der" | "die" | "das";
export type Level = "A1" | "A2" | "B1" | "B2" | "C1";

export interface WordData {
  word: string;
  article: Article;
  rule: string;
  definition_de: string;
  definition_en: string;
}

const LEVEL_VOCAB: Record<Level, string> = {
  A1: "very basic everyday nouns a 6-year-old would know: body parts, food, animals, colors, family members, classroom objects",
  A2: "common everyday nouns: professions, transport, home objects, hobbies, simple abstract nouns",
  B1: "intermediate vocabulary: workplace, environment, society, travel, health, media",
  B2: "upper-intermediate vocabulary: abstract concepts, politics, economy, science, culture",
  C1: "advanced vocabulary: philosophical, legal, technical, nuanced abstract nouns",
};

const DEFINITION_STYLE: Record<Level, string> = {
  A1: "definition_de: max 5 very simple words (like for a child). definition_en: max 5 simple words.",
  A2: "definition_de: 1 short simple sentence. definition_en: 1 short simple sentence.",
  B1: "definition_de: 1 clear sentence in natural German. definition_en: 1 clear sentence.",
  B2: "definition_de: 1-2 sentences with context or example in natural German. definition_en: 1-2 sentences.",
  C1: "definition_de: nuanced definition in sophisticated German, add etymology or cultural note if interesting. definition_en: nuanced 1-2 sentences.",
};

const RESPONSE_SCHEMA = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      word: { type: SchemaType.STRING, description: "German noun, capitalized, no article" },
      article: { type: SchemaType.STRING, enum: ["der", "die", "das"] },
      rule: { type: SchemaType.STRING, description: "Concise gender rule, 1-2 sentences" },
      definition_de: { type: SchemaType.STRING, description: "Definition in German" },
      definition_en: { type: SchemaType.STRING, description: "Definition in English" },
    },
    required: ["word", "article", "rule", "definition_de", "definition_en"],
  },
};

export async function fetchWordBatch(
  level: Level,
  seenWords: string[],
  batchSize = 10
): Promise<WordData[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite-preview",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 1.0,
    },
  });

  const avoidList =
    seenWords.length > 0
      ? `Do NOT include any of these already-seen words: ${seenWords.slice(-150).join(", ")}`
      : "";

  const prompt = `You are a German language teacher. Generate exactly ${batchSize} German nouns for a ${level} level student.

Level ${level} vocabulary scope: ${LEVEL_VOCAB[level]}
${avoidList}

For each word provide:
- word: the noun (capitalize it, no article)
- article: exactly one of "der", "die", or "das"
- rule: a concise gender rule (1-2 sentences). Use these when applicable:
    • Endings -ung, -heit, -keit, -schaft, -tion, -tät, -ie, -ik → die
    • Endings -er (male agent), -ig, -ismus, -ant → der
    • Days/months/seasons/compass directions → der
    • Endings -chen, -lein, -ment, -tum, -um → das
    • Say that up to 80% of nouns with a certain ending/pattern or logic follow the rule, but there are exceptions.
    • If no rule applies: "Kein festes Muster – muss auswendig gelernt werden."
- IMPORTANT: The rule field must ALWAYS be written in German, never in English.
- ${DEFINITION_STYLE[level]}`;

  const result = await model.generateContent(prompt);
  const data = JSON.parse(result.response.text()) as WordData[];

  return data.filter(
    (w) =>
      w.word &&
      ["der", "die", "das"].includes(w.article) &&
      w.rule &&
      w.definition_de &&
      w.definition_en
  );
}
