import { useState, useEffect, useRef } from 'react'
import './App.css'
import { useApiIsLoaded } from '@vis.gl/react-google-maps'


// Function to handle address autocomplete using Google Maps Places API
// Takes onSelect from the props object, sets it to type (address: string), returns void

function AddressAutocomplete({ onSelect }: { onSelect: (address: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isLoaded = useApiIsLoaded()

  useEffect(() => {
    if (!isLoaded || !containerRef.current) return

    let cancelled = false
    let element: any

    const init = async () => {
      const placesLib = await (window as any).google.maps.importLibrary('places')
      if (cancelled) return

      element = new placesLib.PlaceAutocompleteElement({
        includedRegionCodes: ['us'],
        includedPrimaryTypes: ['street_address']
      })

      element.addEventListener('gmp-select', async (e: any) => {
        const place = e.placePrediction.toPlace()
        await place.fetchFields({ fields: ['formattedAddress'] })
        onSelect(place.formattedAddress ?? '')
      })

      containerRef.current?.appendChild(element)
    }

    init()

    return () => {
      cancelled = true
      element?.remove()
    }
  }, [isLoaded])

  return <div ref={containerRef} />
}



function App() {
  const [data, setData] = useState<any>(null)
  const [address, setAddress] = useState<string>("")
  const [notes, setNotes] = useState<string>("")

  const handleSubmit = async () => {
    const fetchData = async () => {
      try{
        const accessKey = sessionStorage.getItem('appKey') ?? prompt('Access code:')
        if (accessKey) sessionStorage.setItem('appKey', accessKey)

        const response = await fetch(`${import.meta.env.VITE_API_URL}/analyze`, {
          method: 'POST',
          headers: {
            'x-app-key': accessKey ?? '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            address: address,
            notes: notes
          })
        })

        if (!response.ok) {
          throw new Error(`Error fetching data from server: ${response.statusText}`);
        }

        const result = await response.json();
        console.log(result)
        setData(result)
      }
      catch(err){
        console.error(err)
      }
    }

    fetchData()
  }

  const analysis = data?.analysis

  const assessmentColor: Record<string, string> = {
    reasonable: 'bg-green-100 text-green-800',
    conservative: 'bg-blue-100 text-blue-800',
    aggressive: 'bg-orange-100 text-orange-800',
  }

  const relevanceColor: Record<string, string> = {
    high: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        <h1 className="text-3xl font-bold text-gray-900">Home Valuation</h1>

        {/* Form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <AddressAutocomplete onSelect={(addr) => setAddress(addr)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agent Notes</label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={4}
                placeholder="Condition, finishes, upgrades, issues observed during showing..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors cursor-pointer"
            >
              Analyze
            </button>
          </div>
        </div>

        {/* Analysis */}
        {analysis && (
          <>
            {/* Summary */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${assessmentColor[analysis.avmAssessment]}`}>
                  AVM {analysis.avmAssessment}
                </span>
                <span className="text-xs text-gray-500">Confidence: <span className="font-medium text-gray-700">{analysis.confidence}</span></span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-3">
                ${analysis.suggestedRange.low.toLocaleString()} – ${analysis.suggestedRange.high.toLocaleString()}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{analysis.avmReasoning}</p>
            </div>

            {/* Comp Rankings */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Comparable Sales</h2>
              <div className="flex flex-col gap-4">
                {analysis.compRankings.map((comp: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div>
                      <span className={`mt-0.5 shrink-0 text-xs font-medium px-2 py-0.5 rounded-full h-fit ${relevanceColor[comp.relevance]}`}>
                      {comp.relevance}
                      </span>
                      <p className="text-sm font-medium text-gray-800">{comp.address}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{comp.reasoning}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

export default App
