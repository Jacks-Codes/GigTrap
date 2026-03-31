import { NextResponse } from 'next/server';
import { getGameStore } from '../../../../../lib/server/gameStore';

export async function POST(request, { params }) {
  const { playerId } = await params;
  const { code, token } = await request.json();
  const store = getGameStore();
  const result = await store.acknowledgeMaintenanceFee(code, playerId, token);

  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
