import { cn } from "@/lib/utils";

interface ScoreCircleProps {
  score: number;
  maxScore?: number;
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  risk?: "Low" | "Moderate" | "High";
}

export function ScoreCircle({
  score,
  maxScore = 100,
  size = "md",
  label,
  risk,
}: ScoreCircleProps) {
  const percentage = (score / maxScore) * 100;
  
  const sizeConfig = {
    sm: { size: 80, stroke: 6, text: "text-lg", label: "text-[10px]" },
    md: { size: 100, stroke: 8, text: "text-2xl", label: "text-xs" },
    lg: { size: 140, stroke: 10, text: "text-3xl", label: "text-sm" },
    xl: { size: 180, stroke: 12, text: "text-4xl", label: "text-base" },
  };

  const config = sizeConfig[size];
  const radius = (config.size - config.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getStrokeColor = () => {
    if (risk === "Low") return "stroke-risk-low";
    if (risk === "Moderate") return "stroke-risk-moderate";
    if (risk === "High") return "stroke-risk-high";
    if (percentage <= 33) return "stroke-risk-low";
    if (percentage <= 66) return "stroke-risk-moderate";
    return "stroke-risk-high";
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: config.size, height: config.size }}>
        <svg
          className="transform -rotate-90"
          width={config.size}
          height={config.size}
        >
          {/* Background circle */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={radius}
            fill="none"
            className="stroke-muted"
            strokeWidth={config.stroke}
          />
          {/* Progress circle */}
          <circle
            cx={config.size / 2}
            cy={config.size / 2}
            r={radius}
            fill="none"
            className={cn("transition-all duration-1000 ease-out", getStrokeColor())}
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-display font-bold", config.text)}>
            {Math.round(score)}
          </span>
          {maxScore !== 100 && (
            <span className="text-muted-foreground text-xs">/{maxScore}</span>
          )}
        </div>
      </div>
      {label && (
        <span className={cn("text-muted-foreground font-medium", config.label)}>
          {label}
        </span>
      )}
    </div>
  );
}
