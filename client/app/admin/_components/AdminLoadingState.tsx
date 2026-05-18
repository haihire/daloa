type AdminLoadingStateProps = {
  title?: string;
  description?: string;
  compact?: boolean;
  className?: string;
};

export function AdminLoadingState({
  title = "불러오는 중입니다",
  description = "데이터를 가져오고 있어요. 잠시만 기다려주세요.",
  compact = false,
  className = "",
}: AdminLoadingStateProps) {
  return (
    <div
      className={`admin-loading-state ${compact ? "is-compact" : ""} ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="admin-loading-spinner" aria-hidden="true" />
      <span className="min-w-0">
        <span className="admin-loading-title">{title}</span>
        {description && (
          <span className="admin-loading-description">{description}</span>
        )}
      </span>
    </div>
  );
}
