import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  usePlaces,
  useDepartmentGeoJSON,
  useRegionGeoJSON,
  useCountryGeoJSON,
  useCommuneGeoJSON,
} from '@/lib/api'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Spinner } from '@/components/ui/Spinner'
import { GenealogyMap, type ViewMode } from '@/components/map/GenealogyMap'

export const Route = createFileRoute('/map')({
  component: CartePage,
})

function CartePage() {
  useEffect(() => {
    document.title = 'Carte · Généalogie'
    return () => { document.title = 'Généalogie' }
  }, [])

  const [mode, setMode] = useState<ViewMode>('department')
  // Tracks which modes have ever been selected so we only fetch data once needed.
  const [enabled, setEnabled] = useState<Record<ViewMode, boolean>>({
    country:    false,
    region:     false,
    department: true,
    commune:    false,
  })

  function handleModeChange(m: ViewMode) {
    setMode(m)
    setEnabled((prev) => ({ ...prev, [m]: true }))
  }

  const { data: places, isLoading: placesLoading, isError } = usePlaces()
  const { data: departments, isLoading: deptLoading }    = useDepartmentGeoJSON(enabled.department)
  const { data: regions,     isLoading: regionLoading }  = useRegionGeoJSON(enabled.region)
  const { data: countries,   isLoading: countryLoading } = useCountryGeoJSON(enabled.country)
  const { data: communes,    isLoading: communeLoading } = useCommuneGeoJSON(enabled.commune)

  if (placesLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6">
        <ErrorBanner message="Impossible de charger les lieux géocodés." />
      </div>
    )
  }

  const layerLoading: Record<ViewMode, boolean> = {
    country:    countryLoading,
    region:     regionLoading,
    department: deptLoading,
    commune:    communeLoading,
  }

  return (
    <GenealogyMap
      places={places ?? []}
      mode={mode}
      onModeChange={handleModeChange}
      layerLoading={layerLoading}
      countries={countries}
      regions={regions}
      departments={departments}
      communes={communes}
    />
  )
}
