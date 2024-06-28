'use client'
import { useRef } from 'react'
import { Provider } from 'react-redux'
import { makeStore, AppStore } from '../lib/store'
import { PersistGate } from 'redux-persist/integration/react'
import { Persistor } from 'redux-persist'

export default function StoreProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const storeRef = useRef<AppStore>()
  const persistorRef = useRef<Persistor>()
  if (!storeRef.current || !persistorRef.current) {
    const { store, persistor } = makeStore()
    storeRef.current = store
    persistorRef.current = persistor
  }
  return (
    <Provider store={storeRef.current}>
      <PersistGate loading={null} persistor={persistorRef.current}>
        {children}
      </PersistGate>
    </Provider>
  )
}
