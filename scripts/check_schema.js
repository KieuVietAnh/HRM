
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkSchema() {
    console.log("Fetching 1 record from 'users'...")
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .limit(1)

    if (error) {
        console.error("Error:", error)
    } else {
        if (data && data.length > 0) {
            console.log("Record found. Keys:", Object.keys(data[0]))
            console.log("Sample Data:", JSON.stringify(data[0], null, 2))
        } else {
            console.log("Table 'users' is empty or no read access.")
        }
    }
}

checkSchema()
