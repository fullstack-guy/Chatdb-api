const getDatabaseStringFromUUID = async (supabase, database_uuid) => {
    try {
        const { data, error } = await supabase
            .from("user_databases")
            .select("database_string")
            .eq("uuid", database_uuid)
            .single();

        if (error || !data || Object.keys(data).length === 0) {
            console.log("Error:", error);
            throw new Error(error.message || "Error fetching database string");
        }

        return { data: { database_string: data.database_string }, error: null };
    } catch (e) {
        return { error: e, data: null };
    }
};

module.exports = { getDatabaseStringFromUUID };
