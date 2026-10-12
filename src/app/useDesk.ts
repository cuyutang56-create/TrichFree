import { useEffect, useState } from 'react';
import { INITIAL_DESK, onDeskChange, readDesk, type DeskState } from '../shared/messages';

export function useDesk(): DeskState {
  const [d, setD] = useState<DeskState>(INITIAL_DESK);
  useEffect(() => {
    readDesk().then(setD);
    return onDeskChange(setD);
  }, []);
  return d;
}
