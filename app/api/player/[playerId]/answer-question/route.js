import { NextResponse } from 'next/server';
import { getGameStore } from '../../../../../lib/server/gameStore';

export async function POST(request, { params }) {
  const { playerId } = await params;
  const { code, token, selectedIndex } = await request.json();
  const store = getGameStore();
  const result = await store.answerQuestion(code, playerId, token, selectedIndex);

  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
