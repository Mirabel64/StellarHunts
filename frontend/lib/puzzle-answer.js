const MAX_ANSWER_LENGTH = 4096;

export function getPuzzleAnswerType(puzzle) {
  return String(
    puzzle?.type ?? puzzle?.content?.type ?? puzzle?.puzzleType ?? "text",
  )
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

export function getPuzzleAnswerOptions(puzzle) {
  const options = puzzle?.options ?? puzzle?.content?.options;
  return Array.isArray(options) ? options : [];
}

export function validatePuzzleAnswer(answer, puzzle) {
  const normalizedAnswer = String(answer ?? "").trim();
  const type = getPuzzleAnswerType(puzzle);

  if (!normalizedAnswer) {
    return "Enter an answer before submitting.";
  }

  if (normalizedAnswer.length > MAX_ANSWER_LENGTH) {
    return `Answers must be ${MAX_ANSWER_LENGTH} characters or fewer.`;
  }

  if (normalizedAnswer.includes("\0")) {
    return "Answers cannot contain null characters.";
  }

  if (type === "number" || type === "math") {
    if (
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalizedAnswer) ||
      !Number.isFinite(Number(normalizedAnswer))
    ) {
      return "Enter a valid number.";
    }
    return null;
  }

  if (type === "multiple_choice") {
    const options = getPuzzleAnswerOptions(puzzle);
    if (options.length === 0) {
      return "This multiple-choice puzzle has no available options.";
    }
    if (!options.includes(normalizedAnswer)) {
      return "Choose one of the available options.";
    }
    return null;
  }

  if (["text", "logic", "code", "image"].includes(type)) {
    return null;
  }

  return "This puzzle uses an unsupported answer format.";
}
