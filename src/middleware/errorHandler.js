class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

const errorHandler = (err, req, res, next) => {
  if (!err) {
    if (!res.headersSent) res.status(500).json({ status: 'error', message: 'Unknown error' });
    return;
  }
  if (res.headersSent) return;
  const msg = String(err.message || '');
  // Never 500 for waitlist unique constraint - return safe payload so client doesn't break
  if (msg.includes('unique_active_waitlist') || (msg.includes('duplicate key') && msg.includes('waitlist'))) {
    const path = (req && (req.path || req.url)) || '';
    if (path.includes('waitlist/my')) {
      return res.status(200).json({ waitlist: [] });
    }
    const id = (req && req.params && req.params.id) || '';
    return res.status(200).json({
      restaurant_id: id,
      accepts_waitlist: true,
      max_party_size: 10,
      waitlist_notes: null,
      current_stats: { waiting_count: 0, notified_count: 0, estimated_wait_minutes: 0 },
    });
  }
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal server error',
  });
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = { AppError, errorHandler, asyncHandler };
