/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { ReactNode, useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore, AppStore } from '../lib/store';
import { PersistGate } from 'redux-persist/integration/react';
import { Persistor } from 'redux-persist';

export default function StoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore>();
  const persistorRef = useRef<Persistor>();
  if (!storeRef.current || !persistorRef.current) {
    const { store, persistor } = makeStore();
    storeRef.current = store;
    persistorRef.current = persistor;
  }
  return (
    <Provider store={storeRef.current}>
      <PersistGate loading={null} persistor={persistorRef.current}>
        {children}
      </PersistGate>
    </Provider>
  );
}
