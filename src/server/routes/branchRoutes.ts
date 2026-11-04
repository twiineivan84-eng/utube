import { Router, Request, Response } from 'express';
import { serverStore } from '../storage/serverStore';

export const branchRouter = Router();

// Get all 6 branches
branchRouter.get('/', (_req: Request, res: Response) => {
  const branches = serverStore.getBranches();
  res.json({
    success: true,
    data: branches,
  });
});

// Get single branch
branchRouter.get('/:id', (req: Request, res: Response) => {
  const branch = serverStore.getBranchById(req.params.id);
  if (!branch) {
    res.status(404).json({ success: false, message: 'Branch not found' });
    return;
  }
  res.json({ success: true, data: branch });
});
