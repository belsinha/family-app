import { Router } from 'express';
import { getAllUsers, getUserById } from '../db/queries/users.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const users = getAllUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = getUserById(parseInt(req.params.id, 10));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;


