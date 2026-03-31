import { NextResponse } from 'next/server';
import { getGameStore } from '../../../../lib/server/gameStore';

export async function POST() {
  const store = getGameStore();
  const result = store.createRoom();
  return NextResponse.json(result);
}
