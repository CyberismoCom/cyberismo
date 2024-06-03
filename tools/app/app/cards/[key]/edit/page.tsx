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
import { Stack, TextField } from '@mui/material'
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
    <Stack height="100%">
      <ContentToolbar
        selectedCard={card}
        project={project}
        mode={CardMode.EDIT}
        onUpdate={handleSave}
        onStateTransition={handleStateTransition}
      />
      <Stack paddingX={3} flexGrow={1} minHeight={0}>
        <Stack
          borderColor="divider"
          borderBottom={1}
          direction="row"
          width="70%"
        >
          <Box flexGrow={1} />
          <Tabs value={value} onChange={handleChange}>
            <Tab label="Edit" />
            <Tab label="Preview" />
          </Tabs>
        </Stack>

        <TabPanel value={value} index={0}>
          <Box
            width="70%"
            sx={{
              overflowY: 'scroll',
              scrollbarWidth: 'thin',
            }}
            height="100%"
            minHeight={0}
          >
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
          </Box>
        </TabPanel>
        <TabPanel value={value} index={1}>
          {card && (
            <Box height="100%">
              <ContentArea card={getPreview()} error={null} preview={true} />
            </Box>
          )}
        </TabPanel>
      </Stack>
      <ErrorBar error={reason} onClose={handleClose} />
    </Stack>
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
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      {...other}
      height="100%"
    >
      {value === index && (
        <Box paddingTop={3} height="100%">
          <Typography component="span" height="100%">
            {children}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
