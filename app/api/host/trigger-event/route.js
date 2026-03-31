import { NextResponse } from 'next/server';
import { getGameStore } from '../../../../lib/server/gameStore';

export async function POST(request) {
  const { code, hostToken, eventType } = await request.json();
  const store = getGameStore();
  const result = await store.triggerEvent(code, hostToken, eventType);

  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
