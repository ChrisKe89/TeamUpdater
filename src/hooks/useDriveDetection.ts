// src/hooks/useDriveDetection.ts
import { useMemo, useState } from 'react'
import { getDriveStatus } from '../lib/runtime'
import type { DetectDrivesResponse, DriveCandidate } from '../types'

export interface UseDriveDetectionOptions {
  selectedDrive: string | null
}

export interface UseDriveDetectionResult {
  driveInfo: DetectDrivesResponse
  selectableDrives: { letter: string; isReachable: boolean }[]
  driveStatus: { tone: 'online' | 'offline'; label: string }
  selectedCandidate: DriveCandidate | null
  initialize: (detected: DetectDrivesResponse) => void
}

export function useDriveDetection({ selectedDrive }: UseDriveDetectionOptions): UseDriveDetectionResult {
  const [driveInfo, setDriveInfo] = useState<DetectDrivesResponse>({
    candidates: [],
    autoSelected: null,
  })

  const initialize = (detected: DetectDrivesResponse) => {
    setDriveInfo(detected)
  }

  const selectedCandidate = useMemo(
    () => driveInfo.candidates.find((candidate) => candidate.letter === selectedDrive) ?? null,
    [driveInfo.candidates, selectedDrive],
  )

  const selectableDrives = useMemo(() => {
    const reachable = driveInfo.candidates.map((candidate) => ({
      letter: candidate.letter,
      isReachable: true,
    }))
    const reachableLetters = new Set(driveInfo.candidates.map((candidate) => candidate.letter))
    if (selectedDrive && !reachableLetters.has(selectedDrive)) {
      return [...reachable, { letter: selectedDrive, isReachable: false }].sort((a, b) =>
        a.letter.localeCompare(b.letter),
      )
    }
    return reachable
  }, [driveInfo.candidates, selectedDrive])

  const driveStatus = useMemo(
    () => getDriveStatus(selectedDrive, selectedCandidate),
    [selectedCandidate, selectedDrive],
  )

  return {
    driveInfo,
    selectableDrives,
    driveStatus,
    selectedCandidate,
    initialize,
  }
}
