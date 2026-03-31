import { NextResponse } from 'next/server';
import { getGameStore } from '../../../../lib/server/gameStore';

export async function GET(_, { params }) {
  const { code } = await params;
  const store = getGameStore();
  const snapshot = await store.getRoomSnapshot(code);

  if (!snapshot) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
