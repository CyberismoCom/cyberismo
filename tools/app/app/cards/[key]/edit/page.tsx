'use client'
import React, { useState } from 'react'
import {
  CardDetails,
  CardMode,
  WorkflowTransition,
} from '@/app/lib/definitions'
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { TextField } from '@mui/material'
import ContentToolbar from '@/app/components/ContentToolbar'
import { useRouter } from 'next/navigation'
import { ContentArea } from '@/app/components/ContentArea'
import ErrorBar from '@/app/components/ErrorBar'
import { useCard, useProject } from '@/app/lib/api/index'
import { useError } from '@/app/lib/utils'

type EditableMetadata = {
  summary: string | undefined
}

export default function Page({ params }: { params: { key: string } }) {
  // Original card and project
  const { project } = useProject()
  const { card, updateCard } = useCard(params.key)

  // Edited card content and metadata
  const [value, setValue] = useState<number>(0)
  const [content, setContent] = useState<string | undefined>(undefined)
  const [metadata, setMetadata] = useState<EditableMetadata | undefined>(
    undefined
  )

  const { reason, setError, handleClose } = useError()
  const router = useRouter()

  const handleStateTransition = async (transition: WorkflowTransition) => {
    try {
      await updateCard({ state: { name: transition.name } })
    } catch (error) {
      if (error instanceof Error) setError(error)
    }
  }

  const handleSave = async () => {
    try {
      await updateCard({
        content,
        metadata,
      })
      router.push(`/cards/${card!.key}`)
    } catch (error) {
      if (error instanceof Error) setError(error)
    }
  }

  if (card) {
    if (!content) setContent(card.content ?? '')
    if (!metadata) setMetadata({ summary: card.metadata?.summary ?? '' })
  }

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue)
  }

  const handleContentChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setContent(event.target.value)
  }

  const handleTitleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMetadata({ ...metadata, summary: event.target.value })
  }

  const getPreview = () => {
    const previewCard: CardDetails = {
      ...card!,
      content: content,
      metadata: {
        ...card!.metadata!,
        summary: metadata?.summary ?? '',
      },
    }
    return previewCard
  }

  return (
    <main className="mainArea">
      <ContentToolbar
        selectedCard={card}
        project={project}
        mode={CardMode.EDIT}
        onUpdate={handleSave}
        onStateTransition={handleStateTransition}
      />
      <div className="innerEdit">
        <Box>
          <Box
            sx={{
              width: '70%',
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'right',
            }}
          >
            <Box sx={{ flexGrow: 1 }} />
            <Tabs value={value} onChange={handleChange}>
              <Tab label="Edit" />
              <Tab label="Preview" />
            </Tabs>
          </Box>

          <TabPanel value={value} index={0}>
            <div className="editContent">
              <TextField
                style={{ width: '100%', marginBottom: '10px' }}
                inputProps={{
                  style: { fontSize: '1.2em', fontWeight: 'bold' },
                }}
                multiline={true}
                value={metadata?.summary ?? ''}
                onChange={handleTitleChange}
              />
              <TextField
                minRows={10}
                multiline={true}
                style={{ width: '100%' }}
                value={content ?? ''}
                onChange={handleContentChange}
              />
            </div>
          </TabPanel>
          <TabPanel value={value} index={1}>
            {card && (
              <ContentArea card={getPreview()} error={null} preview={true} />
            )}
          </TabPanel>
        </Box>
        <ErrorBar error={reason} onClose={handleClose} />
      </div>
    </main>
  )
}

interface TabPanelProps {
  children?: React.ReactNode
  index: any
  value: any
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          <Typography component="span">{children}</Typography>
        </Box>
      )}
    </div>
  )
}
