import { NextResponse } from 'next/server';
import { getGameStore } from '../../../../../lib/server/gameStore';

export async function POST(request, { params }) {
  const { playerId } = await params;
  const { code, token, requestId } = await request.json();
  const store = getGameStore();
  const result = await store.acceptRide(code, playerId, token, requestId);

  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
