import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
dotenv.config()

interface PropertyDetails {
    id: string;
    formattedAddress: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    stateFips: string;
    zipCode: string;
    county: string;
    countyFips: string;
    latitude: number;
    longitude: number;
    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    squareFootage: number;
    lotSize: number;
    yearBuilt: number;
}

// Define structure of rentcast's response for the sublect property (what the agent is trying to value) 
interface SubjectProperty extends PropertyDetails {
    lastSaleDate: string;
    lastSalePrice: number;
}

interface ComparableProperty extends PropertyDetails {
    status: string;
    price: number;
    listingType: string;
    listedDate: string;
    removedDate: string;
    lastSeenDate: string;
    daysOnMarket: number;
    distance: number;
    daysOld: number;
    correlation: number;
}

interface AVMResponse {
    price: number;
    priceRangeLow: number;
    priceRangeHigh: number;
    latitude: number;
    longitude: number;
    subjectProperty: SubjectProperty;
    comparables: ComparableProperty[];
}

interface CompRanking {
    compId: string;
    relevance: "high" | "medium" | "low";
    reasoning: string;
}

interface Analysis {
    avmReasoning: string;
    avmAssessment: "reasonable" | "conservative" | "aggressive";
    compRankings: CompRanking[];
    suggestedRange: { low: number; high: number };
    confidence: "low" | "medium" | "high";
}

const app = express()
const port = process.env.PORT || 3000

const anthropicClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY as string,
});

app.use(cors({
    origin: process.env.FRONTEND_URL, // Replace with your frontend URL
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-app-key'],
    credentials: true
}));

app.use((req, res, next) => {
    const key = req.header('x-app-key')
    if (key !== process.env.APP_ACCESS_KEY) {
        return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
})

app.use(express.urlencoded({ extended: true }));

app.use(express.json());

app.post("/analyze", async (req, res) => {
    const { address, notes } = req.body;
    const rentcastKey: string = process.env.RENTCAST_KEY as string;
    let rentcastData: AVMResponse | null;
    console.log(req.body);
    
    try {
        const response = await fetch(`https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`, {
            headers: { "X-Api-Key": rentcastKey }
        });
        if (!response.ok) {
            throw new Error(`Error fetching data in analyze from Rentcast API: ${response.statusText}`);
        }
        rentcastData = await response.json() as AVMResponse;
    }
    catch (error) {
        console.error("Error in analyze:", error);
        return res.status(500).json({ error: "Failed to fetch data from Rentcast API in analyze" });
    }


    if (!rentcastData) {
        return res.status(404).json({ error: "No Rentcast data found for the provided address" });
    }


    // Take the rentcast comparables array and rank them by correlation score, then take the top 5
    const rankedComps = rentcastData.comparables
        .map( (comp, i) => ({ 
            ...comp, 
            compId: `comp_${i + 1}`, // Add unique ID to each comp for reference in the analysis
            pricePerSqft: comp.price / comp.squareFootage,
        })) // Add new property for price per square foot data point to the comp object
        .sort((a, b) => b.correlation - a.correlation) // Sort by correlation score, descending
        .slice(0, 5);

    // Format the comps into an array of strings for the prompt, including the compId, formatted address, price, price per square foot, distance, and correlation score
    const compsFormatted = rankedComps
        .map(c => `- [${c.compId}] ${c.formattedAddress}: $${c.price.toLocaleString()} ($${c.pricePerSqft.toFixed(1)}/sqft), ${c.bedrooms} bedrooms, ${c.bathrooms} bathrooms, square footage: ${c.squareFootage}sqft, lot size: ${c.lotSize}sqft, ${c.distance}mi away, year built ${c.yearBuilt}, status ${c.status}, ${c.daysOnMarket} days on market, last seen ${c.daysOld} days ago, correlation ${c.correlation.toFixed(3)}`)
        .join('\n');

    const avgPricePerSqft = rankedComps.reduce((sum, c) => sum + c.pricePerSqft, 0) / rankedComps.length ;
    const impliedValue = Math.round(avgPricePerSqft * rentcastData.subjectProperty.squareFootage); // Get the implied value of the selected property by multiplying the average price per square foot of the top 5 comps by the square footage of the subject property
    const subject = rentcastData.subjectProperty;
    const subjectFormatted = `${subject.formattedAddress}: ${subject.bedrooms} bedrooms, ${subject.bathrooms} bathrooms, square footage: ${subject.squareFootage}sqft, lot size: ${subject.lotSize}sqft, year built ${subject.yearBuilt}, last sold ${subject.lastSaleDate.slice(0, 10)} for $${subject.lastSalePrice.toLocaleString()}`

    const prompt = `You are an expert real estate analyst for the Bay Area.
        A RentCast AVM has estimated this property at ${rentcastData.price.toLocaleString()} 
        (range: $${rentcastData.priceRangeLow.toLocaleString()} – $${rentcastData.priceRangeHigh.toLocaleString()}).

        Subject Property: ${subjectFormatted}


        Top 5 comparable listings, ranked by RentCast correlation score (highest first):
        ${compsFormatted}
        The compId field in compRankings must be the bracketed ID exactly as shown above (e.g. comp_1). 
        Do not restate the address or price per square foot there, those are already known.

        Never use a comp's ID (e.g. "comp_1") anywhere in prose, not in avmReasoning, and not in any comp's reasoning text. Instead use the comp's address or descriptive language only in prose. The compId is only for internal reference in the structured data.

        Computed baseline: the average price/sqft across these 5 comps is $${avgPricePerSqft.toFixed(0)}, which implies a value of $${impliedValue.toLocaleString()} for the subject property. Treat this as a verified input — do not recalculate it, only reason about how the agent's notes should adjust it up or down.

        Agent's notes on property condition, finishes, and upgrades:
        Notes: ${notes}

        Your suggestedRange must be consistent with your avmAssessment — if you find the AVM conservative, the range should reflect a value at or above your computed comp-implied baseline, not just a minor adjustment to the AVM's own range.

        If there are discrepancies between the comps and the agent's notes, explain them and trust the agent's expertise.
        
        avmReasoning should be a short prose paragraph only, synthesizing your overall conclusion. Do not include XML tags, field names, or repeat the structured comp data from compRankings — that belongs only in the compRankings array.
    `

    // use a tool to ensure the response is structured and validated against the schema
    const tools: Anthropic.Tool[] = [{
        name: "submit_analysis",
        description: "Submit the analysis of the property based on the Rentcast AVM and agent's notes.",
        strict: true,
        input_schema: {
            type: "object",
            properties: {
                avmReasoning: { type: "string" },
                avmAssessment: { type: "string", enum: [ "reasonable", "conservative", "aggressive" ] },
                compRankings: { type: "array", items: { type: "object", 
                    properties: {
                        compId: { type: "string", enum: rankedComps.map(c => c.compId) },
                        relevance: { type: "string", enum: [ "high", "medium", "low" ] },
                        reasoning: { type: "string" }
                    },
                    required: ["compId", "relevance", "reasoning"],
                    additionalProperties: false
                }},
                suggestedRange: { type: "object", 
                    properties: { 
                        low: { type: "number" }, 
                        high: { type: "number" }
                    },
                    required: ["low", "high"],
                    additionalProperties: false
                },
                confidence: { type: "string", enum: [ "low", "medium", "high" ] },
            },
            required: ["avmAssessment", "avmReasoning", "compRankings", "suggestedRange", "confidence"],
            additionalProperties: false
        }
    }]    
    const message = await anthropicClient.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        messages: [{role: 'user', content: prompt}],
        tools: tools,
        tool_choice: { type: "tool", name: "submit_analysis" }
    })
    console.log("Anthropic API Response:", message);

    const compsById = new Map(rankedComps.map(c => [c.compId, c])); // Generate array of comp objects with their IDs as keys for easy lookup
    const toolUse = message.content.find(block => block.type === "tool_use")
    if (!toolUse) {
        return res.status(500).json({ error: "No tool_use block found in Anthropic API response" });
    }

    const analysis: Analysis = toolUse.input as Analysis;
    if (!Array.isArray(analysis.compRankings) || analysis.compRankings.length !== rankedComps.length) {
        return res.status(500).json({ error: "compRankings in analysis does not match the number of ranked comps" });
    }

    // Create a new array of compRankings that includes the original comp data along with the analysis results
    // This way we dont rely on the anthropic API to return the original comp data like address and $/sqft, which we don't need it to generate
    const compRankings = analysis.compRankings.map(( rankedComp: CompRanking ) => {
        const comp = compsById.get(rankedComp.compId); // Retrieve the original comp object using its ID
        if (!comp) {
            throw new Error(`Comp with ID ${rankedComp.compId} not found in rankedComps`);
        }
        return {
            address: comp.formattedAddress,
            pricePerSqft: comp.pricePerSqft,
            relevance: rankedComp.relevance,
            reasoning: rankedComp.reasoning
        };
    })

    console.log("Analysis:", analysis);
    res.json({ rentcastData, analysis: {...analysis, compRankings} })

})

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});