import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TestCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  isCompleted?: boolean;
  isActive?: boolean;
  isLocked?: boolean;
  score?: number;
  risk?: "Low" | "Moderate" | "High";
  onClick?: () => void;
  step: number;
}

export function TestCard({
  icon,
  title,
  description,
  isCompleted = false,
  isActive = false,
  isLocked = false,
  score,
  risk,
  onClick,
  step,
}: TestCardProps) {
  const riskColors = {
    Low: "border-risk-low bg-risk-low/5",
    Moderate: "border-risk-moderate bg-risk-moderate/5",
    High: "border-risk-high bg-risk-high/5",
  };

  return (
    <Card
      variant={isActive ? "interactive" : "default"}
      className={cn(
        "overflow-hidden transition-all duration-300",
        isCompleted && risk && riskColors[risk],
        isLocked && "opacity-50",
        isActive && "ring-2 ring-primary shadow-glow"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Step indicator */}
          <div
            className={cn(
              "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
              isCompleted
                ? "bg-success text-success-foreground"
                : isActive
                ? "gradient-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            )}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <span className="text-lg font-display font-bold">{step}</span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {icon}
              <h3 className="font-display font-semibold text-foreground truncate">
                {title}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            {isCompleted && score !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm font-medium">Score: {score}</span>
                {risk && (
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      risk === "Low" && "bg-risk-low/20 text-risk-low",
                      risk === "Moderate" && "bg-risk-moderate/20 text-risk-moderate",
                      risk === "High" && "bg-risk-high/20 text-risk-high"
                    )}
                  >
                    {risk}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action */}
          {!isLocked && !isCompleted && (
            <Button
              variant={isActive ? "hero" : "secondary"}
              size="sm"
              onClick={onClick}
              className="flex-shrink-0"
            >
              {isActive ? "Start" : "Begin"}
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
