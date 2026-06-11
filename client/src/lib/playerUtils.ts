export function getPositionColor(position: string): string {
  const pos = position?.toUpperCase() || "";
  
  if (pos === "SP" || pos === "P") {
    return "bg-red-500 text-white";
  }
  if (pos === "RP" || pos === "CP" || pos === "CL") {
    return "bg-pink-400 text-white";
  }
  if (["C", "CATCHER"].includes(pos)) {
    return "bg-blue-500 text-white";
  }
  if (["1B", "2B", "3B", "SS", "IF"].includes(pos)) {
    return "bg-yellow-500 text-black";
  }
  if (["LF", "CF", "RF", "OF"].includes(pos)) {
    return "bg-green-500 text-white";
  }
  if (pos === "DH" || pos === "UTIL") {
    return "bg-gray-500 text-white";
  }
  
  return "bg-muted text-muted-foreground";
}

export function getPositionBorderColor(position: string): string {
  const pos = position?.toUpperCase() || "";
  
  if (pos === "SP" || pos === "P") {
    return "border-red-500";
  }
  if (pos === "RP" || pos === "CP" || pos === "CL") {
    return "border-pink-400";
  }
  if (["C", "CATCHER"].includes(pos)) {
    return "border-blue-500";
  }
  if (["1B", "2B", "3B", "SS", "IF"].includes(pos)) {
    return "border-yellow-500";
  }
  if (["LF", "CF", "RF", "OF"].includes(pos)) {
    return "border-green-500";
  }
  if (pos === "DH" || pos === "UTIL") {
    return "border-gray-500";
  }
  
  return "border-muted";
}

export function getLetterGrade(value: number): { grade: string; color: string } {
  if (value >= 90) {
    return { grade: "S", color: "text-pink-300" };
  }
  if (value >= 80) {
    return { grade: "A", color: "text-pink-500" };
  }
  if (value >= 70) {
    return { grade: "B", color: "text-red-500" };
  }
  if (value >= 60) {
    return { grade: "C", color: "text-orange-500" };
  }
  if (value >= 40) {
    return { grade: "D", color: "text-yellow-500" };
  }
  if (value >= 30) {
    return { grade: "E", color: "text-green-500" };
  }
  if (value >= 20) {
    return { grade: "F", color: "text-blue-500" };
  }
  return { grade: "G", color: "text-gray-400" };
}

export function getLetterGradeColorClass(grade: string): string {
  switch (grade?.toUpperCase()) {
    case "S":
      return "text-pink-300";
    case "A":
      return "text-pink-500";
    case "B":
      return "text-red-500";
    case "C":
      return "text-orange-500";
    case "D":
      return "text-yellow-500";
    case "E":
      return "text-green-500";
    case "F":
      return "text-blue-500";
    case "G":
      return "text-gray-400";
    default:
      return "text-muted-foreground";
  }
}

export function getLetterGradeBgClass(grade: string): string {
  switch (grade?.toUpperCase()) {
    case "S":
      return "bg-pink-300/20";
    case "A":
      return "bg-pink-500/20";
    case "B":
      return "bg-red-500/20";
    case "C":
      return "bg-orange-500/20";
    case "D":
      return "bg-yellow-500/20";
    case "E":
      return "bg-green-500/20";
    case "F":
      return "bg-blue-500/20";
    case "G":
      return "bg-gray-400/20";
    default:
      return "bg-muted/20";
  }
}

export function isPitcher(position: string): boolean {
  const pos = position?.toUpperCase() || "";
  return ["SP", "RP", "CP", "CL", "P"].includes(pos);
}

export function isInfielder(position: string): boolean {
  const pos = position?.toUpperCase() || "";
  return ["1B", "2B", "3B", "SS", "IF"].includes(pos);
}

export function isOutfielder(position: string): boolean {
  const pos = position?.toUpperCase() || "";
  return ["LF", "CF", "RF", "OF"].includes(pos);
}

export function isCatcher(position: string): boolean {
  const pos = position?.toUpperCase() || "";
  return ["C", "CATCHER"].includes(pos);
}

// Convert velocity rating (1-99) to MPH (82-102)
// Rating 1 = 82 MPH, Rating 99 = 102 MPH
export function velocityToMPH(rating: number | null | undefined): number {
  const val = rating ?? 50;
  // Linear interpolation: (val - 1) / (99 - 1) * (102 - 82) + 82
  // Simplified: 82 + (val - 1) * 20 / 98
  return Math.round(82 + ((val - 1) * 20) / 98);
}

// Convert velocity rating (1-99) to KMH (132-164)
// Converts to MPH first then multiplies by 1.60934
export function velocityToKMH(rating: number | null | undefined): number {
  return Math.round(velocityToMPH(rating) * 1.60934);
}

// Get velocity display string with KMH
export function getVelocityDisplay(rating: number | null | undefined): string {
  return `${velocityToKMH(rating)} KMH`;
}
