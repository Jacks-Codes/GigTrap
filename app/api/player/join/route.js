import { NextResponse } from 'next/server';
import { getGameStore } from '../../../../lib/server/gameStore';

export async function POST(request) {
  const { code, name } = await request.json();
  const store = getGameStore();
  const result = await store.createPlayer(code, name);

  if (result.error) {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    state: result.player,
    roomCode: result.room.code,
  });
}
