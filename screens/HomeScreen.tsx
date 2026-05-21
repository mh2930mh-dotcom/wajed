import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, TextInput } from 'react-native';
import { supabase } from '../lib/supabase';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import * as Battery from 'expo-battery';

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  stock: number;
};
const PRODUCTS_CACHE =
  (FileSystem as any).cacheDirectory + 'products-cache.json';

export default function HomeScreen() {
    const navigation = useNavigation();

  
  const [products, setProducts] = useState<Product[]>([]);
  const [cartQuantities, setCartQuantities] = useState<{ [key: string]: number }>({});
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const categories = ['All', 'Dresses', 'Tops', 'Sets', 'Pants'];
  const [isDark, setIsDark] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [currency, setCurrency] = useState('EGP');
  const [batteryLow, setBatteryLow] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(1);
  const [language, setLanguage] = useState('English');

  useEffect(() => {
    getProducts();
    getCartQuantities();
    getWishlist();
    getUserSettings();
    checkNetwork();
    checkBattery();
    const batteryInterval = setInterval(checkBattery, 10000);
  
    const channel = supabase
      .channel('products-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
        },
        () => {
          if (!batteryLow) {
            getProducts();
          }
        }
      )
      .subscribe();
  
    const interval = setInterval(checkNetwork, 5000);
  
    return () => {
      clearInterval(interval);
      clearInterval(batteryInterval);
      supabase.removeChannel(channel);
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      getCartQuantities();
      getWishlist();
      getUserSettings();
    }, [])
  );
  
  async function getProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*');
  
    if (error) {
      console.log(error.message);
  
      const cached = await FileSystem.readAsStringAsync(PRODUCTS_CACHE).catch(() => null);
  
      if (cached) {
        setProducts(JSON.parse(cached));
      }
  
      return;
    }
  
    setProducts(data || []);
  
    await FileSystem.writeAsStringAsync(
      PRODUCTS_CACHE,
      JSON.stringify(data || [])
    );
  }
  async function getCartQuantities() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
  
    if (!user) return;
  
    const { data, error } = await supabase
      .from('cart')
      .select('product_id, quantity')
      .eq('user_id', user.id);
  
    if (error) {
      console.log(error.message);
      return;
    }
  
    const quantities: { [key: string]: number } = {};
  
    data?.forEach((item) => {
      quantities[item.product_id] = item.quantity;
    });
  
    setCartQuantities(quantities);
  }

  async function addToCart(productId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
  
    if (!user) return;
  
    const { data: existingItem, error: findError } = await supabase
      .from('cart')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .maybeSingle();
  
    if (findError) {
      console.log(findError.message);
      return;
    }
  
    if (existingItem) {
      const { error } = await supabase
        .from('cart')
        .update({ quantity: existingItem.quantity + 1 })
        .eq('id', existingItem.id);
  
      if (error) {
        console.log(error.message);
      } else {
        if (hapticsEnabled) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        alert('Quantity updated');
        getCartQuantities();
      }
    } else {
      const { error } = await supabase.from('cart').insert([
        {
          user_id: user.id,
          product_id: productId,
          quantity: 1,
        },
      ]);
  
      if (error) {
        console.log(error.message);
      } else {
        if (hapticsEnabled) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        alert('Added to cart');
        getCartQuantities();
      }
    }
  }
  async function increaseFromHome(productId: string) {
    await addToCart(productId);
  }
  
  async function decreaseFromHome(productId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
  
    if (!user) return;
  
    const { data: existingItem } = await supabase
      .from('cart')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .maybeSingle();
  
    if (!existingItem) return;
  
    if (existingItem.quantity <= 1) {
      await supabase.from('cart').delete().eq('id', existingItem.id);
    } else {
      await supabase
        .from('cart')
        .update({ quantity: existingItem.quantity - 1 })
        .eq('id', existingItem.id);
    }
    if (hapticsEnabled) {
      await Haptics.selectionAsync();
    }
    getCartQuantities(); 
  }

  async function getWishlist() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
  
    if (!user) return;
  
    const { data, error } = await supabase
      .from('wishlist')
      .select('product_id')
      .eq('user_id', user.id);
  
    if (error) {
      console.log(error.message);
      return;
    }
  
    const ids = data.map((item) => item.product_id);
    setWishlist(ids);
  }

  async function toggleWishlist(productId: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
  
    if (!user) return;
  
    if (wishlist.includes(productId)) {
      const { error } = await supabase
        .from('wishlist')
        .delete()
        .eq('user_id', user.id)
        .eq('product_id', productId);
  
      if (error) {
        console.log(error.message);
        return;
      }
  
      await getWishlist();
    } else {
      const { error } = await supabase.from('wishlist').insert([
        {
          user_id: user.id,
          product_id: productId,
        },
      ]);
  
      if (error) {
        console.log(error.message);
        return;
      }
  
      await getWishlist();
    }
  }
  const filteredProducts = products.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === 'All' || item.category === selectedCategory;
  
    return matchesSearch && matchesCategory;
  });
  async function checkNetwork() {
    const state = await Network.getNetworkStateAsync();
    setIsConnected(state.isConnected ?? false);
  }

  function formatPrice(price: number) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(price * exchangeRate);
  }
async function getUserSettings() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { data, error } = await supabase
    .from('user_settings')
    .select('dark_mode, haptics_enabled, currency, language')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.log(error.message);
    return;
  }

  if (data) {
    setIsDark(data.dark_mode);
    setHapticsEnabled(data.haptics_enabled);
    setCurrency(data.currency);
    getExchangeRate(data.currency);
    setLanguage(data.language || 'English');
  }
}
async function checkBattery() {
  const level = await Battery.getBatteryLevelAsync();
  setBatteryLow(level < 0.2);
}
async function getExchangeRate(selectedCurrency: string) {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('target_currency', selectedCurrency)
    .maybeSingle();

  if (error) {
    console.log(error.message);
    return;
  }

  if (data) setExchangeRate(data.rate);
}
const t: any = {
  English: {
    newArrivals: 'New Arrivals',
    search: 'Search products...',
    addToCart: 'Add to Cart',
    offline: 'You are offline',
    battery: 'Battery Saver Mode Enabled',
  },
  French: {
    newArrivals: 'Nouveautés',
    search: 'Rechercher des produits...',
    addToCart: 'Ajouter au panier',
    offline: 'Vous êtes hors ligne',
    battery: 'Mode économie de batterie activé',
  },
  Spanish: {
    newArrivals: 'Novedades',
    search: 'Buscar productos...',
    addToCart: 'Añadir al carrito',
    offline: 'Estás sin conexión',
    battery: 'Modo ahorro de batería activado',
  },
};

const text = t[language] || t.English;

  return (
    <View style= {[ styles.container,{ backgroundColor: isDark ? '#050505' : '#F8F5EF' }, ]}>
      <View style={styles.header}>
      <Text style={[ styles.logo, { color: isDark ? '#C6A75E' : '#111' }, ]}>WAJED</Text>
  <View style={{ flexDirection: 'row', gap: 16 }}>
  <TouchableOpacity onPress={() => navigation.navigate('StoreLocator' as never)}>
  <Ionicons name="map-outline" size={24} color="#C6A75E" />
</TouchableOpacity>
  <TouchableOpacity onPress={() => navigation.navigate('AddProduct' as never)}>
  <Ionicons name="add-circle-outline" size={24} color="#C6A75E" />
</TouchableOpacity>
  <TouchableOpacity onPress={() => navigation.navigate('Scanner' as never)}>
  <Ionicons name="scan-outline" size={24} color="#C6A75E" />
</TouchableOpacity>
  <TouchableOpacity onPress={() => navigation.navigate('Orders' as never)}>
    <Ionicons name="receipt-outline" size={24} color="#C6A75E" />
  </TouchableOpacity>

  <TouchableOpacity onPress={() => navigation.navigate('Cart' as never)}>
    <Ionicons name="cart-outline" size={26} color="#C6A75E" />
  </TouchableOpacity>
</View>
</View>
{!isConnected && (
  <View style={styles.offlineBanner}>
    <Text style={styles.offlineText}>{text.offline}</Text>
  </View>
)}
{batteryLow && (
  <Text
    style={{
      color: '#ffcc00',
      textAlign: 'center',
      marginBottom: 10,
      fontWeight: '700',
    }}
  >
    {text.battery}
  </Text>
)}
<Text style={[ styles.subtitle,{ color: isDark ? '#E8D8B0' : '#111' },]}>{text.newArrivals}</Text>
      <TextInput
  placeholder={text.search}
  placeholderTextColor="#999"
  value={search}
  onChangeText={setSearch}
  style={styles.search}
/>
<View style={styles.categoryRow}>
  {categories.map((cat) => (
    <TouchableOpacity
      key={cat}
      style={[
        styles.categoryButton,
        selectedCategory === cat && styles.activeCategory,
      ]}
      onPress={() => setSelectedCategory(cat)}
    >
      <Text
        style={[
          styles.categoryText,
          selectedCategory === cat && styles.activeCategoryText,
        ]}
      >
        {cat}
      </Text>
    </TouchableOpacity>
  ))}
</View>
      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingBottom: 30 }}
        renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() =>
            (navigation as any).navigate('ProductDetails', {
              productId: item.id,
            })
          }
        >
            <Image source={{ uri: item.image_url }} style={styles.image} />
            <TouchableOpacity
  style={styles.heart}
  onPress={() => toggleWishlist(item.id)}
>
  <Ionicons
    name={wishlist.includes(item.id) ? 'heart' : 'heart-outline'}
    size={24}
    color={wishlist.includes(item.id) ? 'red' : '#050505'}
  />
</TouchableOpacity>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.category}>{item.category}</Text>
            <Text style={styles.price}>{formatPrice(item.price)}</Text>

            {cartQuantities[item.id] ? (
  <View style={styles.qtyControl}>
    <TouchableOpacity onPress={() => decreaseFromHome(item.id)}>
      <Text style={styles.qtyBtn}>−</Text>
    </TouchableOpacity>

    <Text style={styles.qtyText}>{cartQuantities[item.id]}</Text>

    <TouchableOpacity onPress={() => increaseFromHome(item.id)}>
      <Text style={styles.qtyBtn}>+</Text>
    </TouchableOpacity>
  </View>
) : (
  <TouchableOpacity style={styles.button} onPress={() => addToCart(item.id)}>
    
    <Text style={styles.buttonText}>{text.addToCart}</Text>
  </TouchableOpacity>
)}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  logo: {
    color: '#C6A75E',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    color: '#E8D8B0',
    fontSize: 22,
    marginTop: 25,
    marginBottom: 18,
    fontWeight: '600',
  },
  card: {
    flex: 1,
    backgroundColor: '#B8963A',
    borderRadius: 18,
    padding: 10,
    marginBottom: 14,
  },
  image: {
    width: '100%',
    height: 150,
    borderRadius: 14,
    backgroundColor: '#E8D8B0',
  },
  name: {
    color: '#050505',
    fontWeight: '700',
    fontSize: 14,
    marginTop: 10,
  },
  category: {
    color: '#2B2110',
    fontSize: 12,
    marginTop: 3,
  },
  price: {
    color: '#050505',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 6,
  },
  button: {
    backgroundColor: '#050505',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#C6A75E',
    fontWeight: '700',
  },
  qtyControl: {
    backgroundColor: '#050505',
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  
  qtyBtn: {
    color: '#C6A75E',
    fontSize: 22,
    fontWeight: '800',
  },
  
  qtyText: {
    color: '#C6A75E',
    fontSize: 16,
    fontWeight: '800',
  },
  heart: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 1,
  },
  search: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#C6A75E',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  
  categoryButton: {
    borderWidth: 1,
    borderColor: '#C6A75E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  
  activeCategory: {
    backgroundColor: '#C6A75E',
  },
  
  categoryText: {
    color: '#C6A75E',
    fontWeight: '700',
  },
  
  activeCategoryText: {
    color: '#050505',
  },
  offlineBanner: {
    backgroundColor: '#7A1F1F',
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  
  offlineText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '800',
  },
});