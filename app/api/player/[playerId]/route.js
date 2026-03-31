import { NextResponse } from 'next/server';
import { getGameStore } from '../../../../lib/server/gameStore';

export async function GET(request, { params }) {
  const { playerId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const token = searchParams.get('token');
  const store = getGameStore();
  const result = await store.getPlayerState(code, playerId, token);

  if (!result) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  if (result.error) {
    return NextResponse.json(result, { status: 401 });
  }

  return NextResponse.json(result);
}
