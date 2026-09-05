import { create } from 'zustand';
import db from '../db/database';

export const useAuthStore = create((set) => ({
  currentStaff: null,
  login: (staff) => set({ currentStaff: staff }),
  logout: async () => { try { await db.rpc('end_pos_session'); } finally { set({ currentStaff: null }); } },
}));
