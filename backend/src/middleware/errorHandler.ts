import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err.message);
  if (err.stack) {
    console.error('Stack:', err.stack);
  }
  
  // Always return error message for better debugging - this is a family app, not public-facing
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'An unexpected error occurred',
  });
};









