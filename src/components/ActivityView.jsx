import { useMemo, useState } from 'react';

const PAGE_SIZE = 8;

export default function ActivityView({ activity }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(activity.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pagedActivity = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return activity.slice(start, start + PAGE_SIZE);
  }, [activity, safePage]);

  if (safePage !== page) {
    setPage(safePage);
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ marginBottom: 12 }}>Recent Activity</h3>
      {activity.length === 0 ? (
        <div className="empty-state">
          <h3>No activity yet</h3>
          <p>Actions you take will appear here.</p>
        </div>
      ) : (
        <>
          <div className="activity-log">
            {pagedActivity.map((item) => {
              const type = item.type || '';
              const typeClass =
                type === 'page_view'
                  ? 'view'
                  : type.indexOf('delete') !== -1 || type === 'appointment_deleted'
                  ? 'delete'
                  : type.indexOf('update') !== -1 || type.indexOf('updated') !== -1
                  ? 'update'
                  : 'add';
              return (
                <div key={item.id} className="activity-item">
                  <div className={`activity-icon ${typeClass}`}></div>
                  <div className="activity-content">
                    <div className="activity-text">{item.description}</div>
                    <div className="activity-time">{new Date(item.timestamp).toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="activity-pagination">
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <div className="activity-page-indicator">
              Page {safePage} of {totalPages}
            </div>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
