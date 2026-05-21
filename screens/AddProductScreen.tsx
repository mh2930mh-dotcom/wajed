import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

export default function AddProductScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const navigation = useNavigation();

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  }

  async function addProduct() {
    if (!image || !name || !price || !category) {
      Alert.alert('Please fill all fields and choose image');
      return;
    }

    const fileName = `${Date.now()}.jpg`;
    const response = await fetch(image);
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(fileName, blob);

    if (uploadError) {
      Alert.alert(uploadError.message);
      return;
    }

    const { data } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    const { error } = await supabase.from('products').insert([
      {
        name,
        price: Number(price),
        category,
        barcode,
        image_url: data.publicUrl,
        stock: 10,
        description: 'Uploaded by vendor',
      },
    ]);

    if (error) Alert.alert(error.message);
    else Alert.alert('Product added successfully ✨');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
      <TouchableOpacity
  onPress={() => navigation.goBack()}
  style={styles.backButton}
>
  <Ionicons name="arrow-back-outline" size={28} color="#C6A75E" />
</TouchableOpacity>
      <Text style={styles.logo}>WAJED</Text>
      <Text style={styles.title}>Add Product</Text>

      <TouchableOpacity style={styles.imageBox} onPress={pickImage}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} />
        ) : (
          <Text style={styles.imageText}>Choose Product Image</Text>
        )}
      </TouchableOpacity>

      <TextInput style={styles.input} placeholder="Product name" placeholderTextColor="#999" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Price" placeholderTextColor="#999" value={price} onChangeText={setPrice} keyboardType="numeric" />
      <TextInput style={styles.input} placeholder="Category" placeholderTextColor="#999" value={category} onChangeText={setCategory} />
      <TextInput style={styles.input} placeholder="Barcode" placeholderTextColor="#999" value={barcode} onChangeText={setBarcode} />

      <TouchableOpacity style={styles.button} onPress={addProduct}>
        <Text style={styles.buttonText}>Upload Product</Text>
      </TouchableOpacity>
      </View>
</ScrollView>
</KeyboardAvoidingView>
);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505', paddingTop: 60, paddingHorizontal: 18 },
  logo: { color: '#C6A75E', fontSize: 34, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
  title: { color: '#E8D8B0', fontSize: 24, fontWeight: '800', marginTop: 25, marginBottom: 20 },
  imageBox: { height: 180, borderWidth: 1, borderColor: '#C6A75E', borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 15, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  imageText: { color: '#C6A75E', fontWeight: '800' },
  input: { backgroundColor: '#111', color: '#fff', borderWidth: 1, borderColor: '#C6A75E', borderRadius: 12, padding: 13, marginBottom: 12 },
  button: { backgroundColor: '#C6A75E', padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#050505', fontWeight: '800' },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
  },
});