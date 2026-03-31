import { NextResponse } from 'next/server';
import { getGameStore } from '../../../../lib/server/gameStore';

export async function POST(request) {
  const { code, hostToken } = await request.json();
  const store = getGameStore();
  const result = store.pauseGame(code, hostToken);

  if (result.error) {
    return NextResponse.json(result, { status: 401 });
  }

  return NextResponse.json(result);
}
