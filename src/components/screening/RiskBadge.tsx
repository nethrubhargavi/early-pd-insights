import { cn } from "@/lib/utils";

interface RiskBadgeProps {
  risk: "Low" | "Moderate" | "High";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function RiskBadge({ risk, size = "md", showLabel = true }: RiskBadgeProps) {
  const sizeClasses = {
    sm: "h-2 w-2",
    md: "h-3 w-3",
    lg: "h-4 w-4",
  };

  const colorClasses = {
    Low: "bg-risk-low",
    Moderate: "bg-risk-moderate",
    High: "bg-risk-high",
  };

  const textColorClasses = {
    Low: "text-risk-low",
    Moderate: "text-risk-moderate",
    High: "text-risk-high",
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "rounded-full animate-pulse-slow",
          sizeClasses[size],
          colorClasses[risk]
        )}
      />
      {showLabel && (
        <span
          className={cn(
            "font-medium",
            size === "sm" && "text-xs",
            size === "md" && "text-sm",
            size === "lg" && "text-base",
            textColorClasses[risk]
          )}
        >
          {risk} Risk
        </span>
      )}
    </div>
  );
}
