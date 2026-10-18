import { cn } from "../../lib/utils";

const LoadingSpinner = ({ className, size = "md" }) => {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center justify-center", className)}
    >
      <div
        aria-hidden="true"
        className={cn(
          "animate-spin rounded-full border-2 border-gray-300 border-t-blue-600",
          sizeClasses[size]
        )}
      />
      <span className="sr-only">Loading</span>
    </div>
  );
};

export default LoadingSpinner; 