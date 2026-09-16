template <class T> class Probe {
public:
  virtual ~Probe() {}
  virtual int eval(T value) ;
  virtual void set(T value) ;
  T data;
};
template <class T> int Probe<T>::eval(T value) { return value + 7; }
template <class T> void Probe<T>::set(T value) { data = value; }

Probe<int> instance;
Probe<int>* getInstance() { return &instance; }
