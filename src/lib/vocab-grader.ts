import { singleChatResponse, LlmConfig } from "./llm";

const GRADING_PROMPT = `You are a vocabulary quiz grader. You receive a term, its correct definition, and a student's answer.

Grade whether the student's answer captures the CORE MEANING. Be forgiving of:
- Different wording, phrasing, or sentence structure
- Minor spelling mistakes
- Informal or incomplete sentences
- Giving a valid example instead of a textbook definition

Be strict about:
- The core concept must be present — vague or tangential answers are wrong
- Confusing the term with a related but different concept is wrong
- "I don't know" or empty answers are wrong

Respond with EXACTLY this JSON (no other text):
{"correct": true, "feedback": "one sentence"}

If correct, affirm what they got right.
If wrong, briefly state the correct definition.`;

export interface GradeResult {
  correct: boolean;
  feedback: string;
}

export async function gradeVocabAnswer(
  term: string,
  definition: string,
  studentAnswer: string,
  llmConfig: LlmConfig
): Promise<GradeResult> {
  const userMessage = `Term: "${term}"\nCorrect definition: "${definition}"\nStudent's answer: "${studentAnswer}"`;

  try {
    const response = await singleChatResponse(GRADING_PROMPT, userMessage, llmConfig, true);
    // Extract JSON from response (LLM might wrap it in markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      correct: !!parsed.correct,
      feedback: typeof parsed.feedback === "string" ? parsed.feedback.slice(0, 300) : "No feedback.",
    };
  } catch (error) {
    console.error("Vocab grading error:", error);
    // Fallback: basic containment check so drill doesn't break on API issues
    const normAnswer = studentAnswer.toLowerCase().trim();
    const normDef = definition.toLowerCase().trim();
    const words = normDef.split(/\s+/).filter((w) => w.length > 4);
    const matchCount = words.filter((w) => normAnswer.includes(w)).length;
    const correct = words.length > 0 && matchCount / words.length >= 0.4;
    return {
      correct,
      feedback: correct ? "Looks right!" : `The correct answer is: ${definition}`,
    };
  }
}
