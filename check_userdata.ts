
import { supabase } from './lib/supabase';

const checkUsers = async () => {
    const { data: users, error } = await supabase
        .from('users')
        .select('id, name, email, username')
        .limit(10);

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.log('Users:', JSON.stringify(users, null, 2));
};

checkUsers();
