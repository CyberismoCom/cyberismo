'use client'
import { TreeMenu } from '../components/TreeMenu'
import { usePathname } from 'next/navigation'
import AppToolbar from '../components/AppToolbar'
import { CircularProgress } from '@mui/material'
import { useProject } from '../lib/api'
import { SWRConfig } from 'swr'
import { getSwrConfig } from '../lib/swr'


function MainLayout({ children }: Readonly<{ children: React.ReactNode }>) {

  // Last URL parameter after /cards base is the card key
  const urlParts = usePathname().slice(1).split('/')
  const urlCardKey = urlParts[0] == 'cards' ? urlParts[1] ?? null : null


  const { project, error, isLoading } = useProject();

  if (isLoading)
    return (
      <div className="container">
        <AppToolbar />
        <main className="loading">
          <CircularProgress size={60} color="primary" />
        </main>
      </div>
    )

  if (error || !project)
    return (
      <div className="container">
        <AppToolbar />
        <main className="loading">
          <div>
            <p>Could not open project:</p>
            <p>{error.message}</p>
          </div>
        </main>
      </div>
    )

  return (
    <div className="container">
      <AppToolbar />
      <div className="main">
        <TreeMenu project={project} selectedCardKey={urlCardKey} />
        <>{children}</>
      </div>
    </div>
  )
}


export default function CardsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <SWRConfig value={getSwrConfig()}>
    <MainLayout>
      {children}
    </MainLayout>
  </SWRConfig>
}
